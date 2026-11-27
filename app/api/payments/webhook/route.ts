import { NextRequest, NextResponse } from "next/server";
import {
  getYooKassaPayment,
  isYooKassaWebhookIp,
  isUuid,
  parseWholeRubleAmount,
  supabaseRpc,
  syncYooKassaPayment,
} from "@/lib/yookassa";
import {
  getYooKassaRefund,
  type YooKassaRefund,
} from "@/lib/yookassa-refunds";
import { processLatePaymentRefund } from "@/lib/yookassa-late-refunds";
import { prepareAndStartBookingServiceRefund } from "@/lib/booking-service-refunds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentRefundRow = {
  id: string;
  booking_operation_id: string;
  payment_group_id: string;
  provider: string;
  provider_payment_id: string;
  provider_refund_id: string | null;
  amount_rub: number;
  currency: string;
  status: string;
};

type BookingOperationRow = {
  id: string;
  operation_type: string;
  booking_id: string;
};

type SupabaseConfig = {
  url: string;
  key: string;
};

function response(status: number) {
  return new NextResponse(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Supabase configuration is not available.");
  }

  return { url, key };
}

async function supabaseSelect<T>(
  table: string,
  params: Record<string, string>,
): Promise<T[]> {
  const config = getSupabaseConfig();
  const url = new URL(`${config.url}/rest/v1/${table}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const result = await fetch(url, {
    method: "GET",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!result.ok) {
    console.error("[yookassa-webhook] Supabase lookup failed", {
      table,
      status: result.status,
    });
    throw new Error("Supabase lookup failed.");
  }

  const rows: unknown = await result.json();

  if (!Array.isArray(rows)) {
    throw new Error("Supabase returned an invalid lookup result.");
  }

  return rows as T[];
}

async function findRefundRow(
  refundId: string,
  paymentId: string,
  amountRub: number,
): Promise<PaymentRefundRow | null> {
  const selected =
    "id,booking_operation_id,payment_group_id,provider,provider_payment_id,provider_refund_id,amount_rub,currency,status";

  // First attempt: exact provider refund ID.
  const exactRows = await supabaseSelect<PaymentRefundRow>(
    "payment_refunds",
    {
      select: selected,
      provider: "eq.yookassa",
      provider_refund_id: `eq.${refundId}`,
      limit: "2",
    },
  );

  if (exactRows.length > 1) {
    throw new Error("Multiple local records match the provider refund ID.");
  }

  if (exactRows.length === 1) {
    const row = exactRows[0];

    if (
      row.provider !== "yookassa" ||
      row.provider_refund_id !== refundId ||
      row.provider_payment_id !== paymentId ||
      row.amount_rub !== amountRub ||
      row.currency !== "RUB"
    ) {
      throw new Error("Exact refund record does not match provider data.");
    }

    return row;
  }

  // Race fallback:
  // YooKassa may send refund.succeeded before our server has saved
  // provider_refund_id. Accept only one pending record with no provider ID.
  const candidates = await supabaseSelect<PaymentRefundRow>(
    "payment_refunds",
    {
      select: selected,
      provider: "eq.yookassa",
      provider_payment_id: `eq.${paymentId}`,
      amount_rub: `eq.${amountRub}`,
      currency: "eq.RUB",
      status: "eq.pending",
      provider_refund_id: "is.null",
      limit: "2",
    },
  );

  if (candidates.length > 1) {
    throw new Error("Refund notification matches multiple pending records.");
  }

  if (candidates.length === 0) {
    return null;
  }

  const candidate = candidates[0];

  if (
    candidate.provider !== "yookassa" ||
    candidate.provider_payment_id !== paymentId ||
    candidate.amount_rub !== amountRub ||
    candidate.currency !== "RUB" ||
    candidate.status !== "pending" ||
    candidate.provider_refund_id !== null
  ) {
    throw new Error("Fallback refund record failed validation.");
  }

  return candidate;
}

async function getRefundOperation(
  operationId: string,
): Promise<BookingOperationRow> {
  if (!isUuid(operationId)) {
    throw new Error("Invalid booking operation ID.");
  }

  const rows = await supabaseSelect<BookingOperationRow>(
    "booking_operations",
    {
      select: "id,operation_type,booking_id",
      id: `eq.${operationId}`,
      limit: "2",
    },
  );

  if (
    rows.length !== 1 ||
    rows[0].id !== operationId ||
    typeof rows[0].operation_type !== "string" ||
    !isUuid(rows[0].booking_id)
  ) {
    throw new Error("Booking operation could not be identified.");
  }

  return rows[0];
}

function validateRefund(
  refund: YooKassaRefund,
  notification: Record<string, unknown>,
  expectedRefundId: string,
): {
  id: string;
  paymentId: string;
  amountRub: number;
  status: "pending" | "succeeded" | "canceled";
} {
  if (
    typeof refund.id !== "string" ||
    refund.id !== expectedRefundId ||
    refund.id.length > 200
  ) {
    throw new Error("Authoritative refund ID is invalid.");
  }

  if (
    typeof refund.payment_id !== "string" ||
    refund.payment_id.length < 1 ||
    refund.payment_id.length > 200
  ) {
    throw new Error("Authoritative refund payment ID is invalid.");
  }

  // If notification contains payment_id, it must agree with YooKassa GET.
  if (
    typeof notification.payment_id === "string" &&
    notification.payment_id !== refund.payment_id
  ) {
    throw new Error("Notification and provider payment IDs do not match.");
  }

  const amountRub = parseWholeRubleAmount(refund.amount);

  if (amountRub === null || amountRub < 1) {
    throw new Error("Authoritative refund amount is invalid.");
  }

  if (
    refund.status !== "pending" &&
    refund.status !== "succeeded" &&
    refund.status !== "canceled"
  ) {
    throw new Error("Authoritative refund status is invalid.");
  }

  return {
    id: refund.id,
    paymentId: refund.payment_id,
    amountRub,
    status: refund.status,
  };
}

async function processRefundNotification(
  notification: Record<string, unknown>,
) {
  const notificationId = notification.id;

  if (
    typeof notificationId !== "string" ||
    notificationId.length < 1 ||
    notificationId.length > 200
  ) {
    console.warn("[yookassa-webhook] invalid refund notification ID");
    return response(400);
  }

  const refundIdSuffix = notificationId.slice(-8);

  try {
    // Notification payload is not authoritative.
    // Always retrieve the current refund directly from YooKassa.
    const providerRefund = await getYooKassaRefund(notificationId);

    const refund = validateRefund(
      providerRefund,
      notification,
      notificationId,
    );

    const paymentIdSuffix = refund.paymentId.slice(-8);

    console.info("[yookassa-webhook] provider refund verified", {
      refundIdSuffix,
      paymentIdSuffix,
      providerStatus: refund.status,
      amountRub: refund.amountRub,
    });

    const row = await findRefundRow(
      refund.id,
      refund.paymentId,
      refund.amountRub,
    );

    if (!row) {
      console.error("[yookassa-webhook] local refund record not found", {
        refundIdSuffix,
        paymentIdSuffix,
      });
      return response(503);
    }

    if (
      !isUuid(row.id) ||
      !isUuid(row.booking_operation_id) ||
      !isUuid(row.payment_group_id)
    ) {
      throw new Error("Local refund record contains invalid identifiers.");
    }

    const operation = await getRefundOperation(row.booking_operation_id);
    const operationType = operation.operation_type;

    const rpcPayload = {
      p_refund_id: row.id,
      p_provider_refund_id: refund.id,
      p_provider_status: refund.status,
      p_provider_response: {
        id: refund.id,
        payment_id: refund.paymentId,
        status: refund.status,
        amount: {
          value: refund.amountRub.toFixed(2),
          currency: "RUB",
        },
      },
    };

    let databaseResult: string;

    if (operationType === "late_payment_refund") {
      databaseResult = await supabaseRpc<string>(
        "finalize_late_payment_refund",
        rpcPayload,
      );

      const acceptedResults = new Set([
        "refunded",
        "pending",
        "retry_required",
        "terminal_refund_record",
        "review_required",
        "already_refunded",
      ]);

      if (!acceptedResults.has(databaseResult)) {
        throw new Error("Unexpected late refund finalization result.");
      }
    } else if (operationType === "transfer") {
      databaseResult = await supabaseRpc<string>(
        "finalize_customer_booking_transfer_refund",
        rpcPayload,
      );

      const acceptedResults = new Set([
        "completed",
        "refund_recorded",
        "pending",
        "retry_required",
        "manual_resolution_required",
        "terminal_refund_state",
        "terminal_operation_state",
        "already_completed",
      ]);

      if (!acceptedResults.has(databaseResult)) {
        throw new Error("Unexpected transfer refund finalization result.");
      }
    } else if (operationType === "cancellation") {
      databaseResult = await supabaseRpc<string>(
        "finalize_customer_booking_cancellation",
        rpcPayload,
      );

      const acceptedResults = new Set([
        "completed",
        "refund_recorded",
        "pending",
        "retry_required",
        "terminal_refund_state",
        "already_completed",
      ]);

      if (!acceptedResults.has(databaseResult)) {
        throw new Error("Unexpected cancellation refund finalization result.");
      }

      if (databaseResult === "completed" || databaseResult === "already_completed") {
        await prepareAndStartBookingServiceRefund(operation.booking_id);
      }
    } else if (operationType === "service_refund") {
      databaseResult = await supabaseRpc<string>(
        "finalize_customer_booking_service_refund",
        rpcPayload,
      );

      const acceptedResults = new Set([
        "completed",
        "refund_recorded",
        "pending",
        "retry_required",
        "terminal_refund_state",
        "already_completed",
      ]);

      if (!acceptedResults.has(databaseResult)) {
        throw new Error("Unexpected service refund finalization result.");
      }
    } else {
      console.error("[yookassa-webhook] unsupported refund operation type", {
        refundIdSuffix,
        operationType,
      });
      return response(503);
    }

    console.info("[yookassa-webhook] refund synchronized", {
      refundIdSuffix,
      paymentIdSuffix,
      operationType,
      providerStatus: refund.status,
      databaseResult,
    });

    // A pending refund is not final. Ask YooKassa to retry later.
    if (refund.status === "pending") {
      return response(503);
    }

    return response(200);
  } catch (error) {
    console.error("[yookassa-webhook] refund processing failed", {
      refundIdSuffix,
      errorName: errorName(error),
    });

    // Unknown or ambiguous state must not be acknowledged.
    return response(503);
  }
}

export async function POST(request: NextRequest) {
  const sourceIp = request.headers.get("x-real-ip")?.trim() ?? null;
  const ipAllowed = isYooKassaWebhookIp(sourceIp);

  console.info("[yookassa-webhook] request received", {
    sourceIpPresent: Boolean(sourceIp),
    ipAllowed,
  });

  if (!ipAllowed) {
    console.warn("[yookassa-webhook] rejected by IP allowlist", {
      sourceIpPresent: Boolean(sourceIp),
    });
    return response(403);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    console.warn("[yookassa-webhook] invalid JSON body");
    return response(400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    console.warn("[yookassa-webhook] invalid notification body shape");
    return response(400);
  }

  const payload = body as Record<string, unknown>;
  const event = payload.event;
  const object = payload.object;

  if (event === "refund.succeeded") {
    if (!object || typeof object !== "object" || Array.isArray(object)) {
      console.warn("[yookassa-webhook] refund notification object is invalid");
      return response(400);
    }

    return processRefundNotification(
      object as Record<string, unknown>,
    );
  }

  if (event !== "payment.succeeded" && event !== "payment.canceled") {
    console.info("[yookassa-webhook] ignored event", {
      event: typeof event === "string" ? event : "invalid",
    });
    return response(200);
  }

  if (!object || typeof object !== "object" || Array.isArray(object)) {
    console.warn("[yookassa-webhook] notification object is invalid", {
      event,
    });
    return response(400);
  }

  const paymentId = (object as Record<string, unknown>).id;

  if (typeof paymentId !== "string" || paymentId.length > 128) {
    console.warn("[yookassa-webhook] notification has invalid payment ID", {
      event,
    });
    return response(400);
  }

  const paymentIdSuffix = paymentId.slice(-8);

  try {
    // Existing payment workflow: retrieve authoritative provider data.
    const payment = await getYooKassaPayment(paymentId);

    const providerStatus =
      typeof payment.status === "string" ? payment.status : "invalid";

    console.info("[yookassa-webhook] provider response received", {
      event,
      paymentIdSuffix,
      providerStatus,
    });

    const groupId = payment.metadata?.payment_group_id;

    if (!isUuid(groupId)) {
      console.error("[yookassa-webhook] payment has no valid group metadata", {
        event,
        paymentIdSuffix,
      });
      return response(200);
    }

    if (payment.id !== paymentId) {
      console.error("[yookassa-webhook] payment ID mismatch", {
        event,
        paymentIdSuffix,
      });
      return response(200);
    }

    const syncResult = await syncYooKassaPayment(payment, groupId);

    console.info("[yookassa-webhook] synchronization completed", {
      event,
      paymentIdSuffix,
      providerStatus: syncResult.providerStatus,
      databaseResult: syncResult.databaseResult ?? null,
    });

    if (syncResult.providerStatus === "pending") {
      console.warn(
        "[yookassa-webhook] provider status is still pending; requesting retry",
        { event, paymentIdSuffix },
      );
      return response(503);
    }

    if (
      syncResult.providerStatus === "succeeded" &&
      syncResult.databaseResult === "late_success_refund_required"
    ) {
      const amountRub = parseWholeRubleAmount(payment.amount);

      if (amountRub === null) {
        throw new Error("Late payment amount is invalid.");
      }

      const refundResult = await processLatePaymentRefund({
        paymentGroupId: groupId,
        providerPaymentId: paymentId,
        amountRub,
      });

      console.info("[yookassa-webhook] late payment refund processed", {
        paymentIdSuffix,
        refundState: refundResult.state,
      });
    }

    return response(200);
  } catch (error) {
    console.error("[yookassa-webhook] processing failed", {
      event,
      paymentIdSuffix,
      errorName: errorName(error),
    });

    // Non-200 asks YooKassa to retry after transient failures.
    return response(503);
  }
}
