
import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTokenFromRequest,
  getYooKassaPayment,
  isUuid,
  parseWholeRubleAmount,
  resolveSessionUserId,
  supabaseRpc,
  syncYooKassaPayment,
  type PaymentSyncResult,
} from "@/lib/yookassa";
import { processLatePaymentRefund } from "@/lib/yookassa-late-refunds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentGroupStatus = {
  payment_group_id: string;
  payment_status: string;
  provider: string;
  provider_payment_id: string | null;
  amount_rub: number;
  currency: string;
  hold_expires_at: string | null;
  payment_init_started_at: string | null;
  booking_count: number;
  pending_booking_count: number;
  confirmed_booking_count: number;
};

type TransferOperationStatus = {
  id: string;
  status: string;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
};

type LateRefundOperation = {
  id: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

type LateRefundRow = {
  id: string;
  status: string;
  amount_rub: number;
  failure_reason: string | null;
  provider_refund_id: string | null;
  created_at: string;
  succeeded_at: string | null;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

function errorStatusCode(error: unknown): number | null {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return null;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;

  return url && key ? { url, key } : null;
}

async function readTransferOperation(
  paymentGroupId: string,
  userId: string,
): Promise<TransferOperationStatus | null> {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase configuration is not available.");

  const target = new URL(
    `${config.url}/rest/v1/booking_operations`,
  );

  target.searchParams.set(
    "select",
    "id,status,completed_at,metadata",
  );
  target.searchParams.set("user_id", `eq.${userId}`);
  target.searchParams.set(
    "adjustment_payment_group_id",
    `eq.${paymentGroupId}`,
  );
  target.searchParams.set("operation_type", "eq.transfer");
  target.searchParams.set("limit", "1");

  const response = await fetch(target, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    console.error("[payment-status] transfer operation lookup failed", {
      httpStatus: response.status,
    });
    throw new Error("Transfer operation lookup failed.");
  }

  const rows: unknown = await response.json();

  if (!Array.isArray(rows)) {
    throw new Error("Invalid transfer operation response.");
  }

  return (rows[0] as TransferOperationStatus | undefined) ?? null;
}

async function readLateRefundOperation(
  paymentGroupId: string,
  userId: string,
): Promise<{
  operation: LateRefundOperation | null;
  refund: LateRefundRow | null;
}> {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase configuration is not available.");

  const operationUrl = new URL(
    `${config.url}/rest/v1/booking_operations`,
  );

  operationUrl.searchParams.set(
    "select",
    "id,status,metadata",
  );
  operationUrl.searchParams.set("user_id", `eq.${userId}`);
  operationUrl.searchParams.set(
    "source_payment_group_id",
    `eq.${paymentGroupId}`,
  );
  operationUrl.searchParams.set(
    "operation_type",
    "eq.late_payment_refund",
  );
  operationUrl.searchParams.set("limit", "1");

  const operationResponse = await fetch(operationUrl, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!operationResponse.ok) {
    console.error("[payment-status] late refund operation lookup failed", {
      httpStatus: operationResponse.status,
    });
    throw new Error("Late refund operation lookup failed.");
  }

  const operationRows: unknown = await operationResponse.json();

  if (!Array.isArray(operationRows)) {
    throw new Error("Invalid late refund operation response.");
  }

  const operation =
    (operationRows[0] as LateRefundOperation | undefined) ?? null;

  if (!operation) {
    return { operation: null, refund: null };
  }

  const refundUrl = new URL(
    `${config.url}/rest/v1/payment_refunds`,
  );

  refundUrl.searchParams.set(
    "select",
    "id,status,amount_rub,failure_reason,provider_refund_id,created_at,succeeded_at",
  );
  refundUrl.searchParams.set(
    "booking_operation_id",
    `eq.${operation.id}`,
  );
  refundUrl.searchParams.set("order", "created_at.desc");
  refundUrl.searchParams.set("limit", "1");

  const refundResponse = await fetch(refundUrl, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!refundResponse.ok) {
    console.error("[payment-status] late refund record lookup failed", {
      httpStatus: refundResponse.status,
    });
    throw new Error("Late refund record lookup failed.");
  }

  const refundRows: unknown = await refundResponse.json();

  if (!Array.isArray(refundRows)) {
    throw new Error("Invalid late refund record response.");
  }

  return {
    operation,
    refund: (refundRows[0] as LateRefundRow | undefined) ?? null,
  };
}

function hasManualResolution(
  metadata: Record<string, unknown> | null,
) {
  return metadata?.manual_resolution_required === true;
}

function hasRefundRetry(
  metadata: Record<string, unknown> | null,
) {
  return metadata?.refund_retry_required === true;
}

export async function GET(request: NextRequest) {
  const sessionToken = getSessionTokenFromRequest(request);

  if (!sessionToken) {
    return errorResponse("Войдите в личный кабинет.", 401);
  }

  const paymentGroupId =
    request.nextUrl.searchParams.get("payment_group_id");

  if (!isUuid(paymentGroupId)) {
    return errorResponse(
      "Некорректный идентификатор бронирования.",
      400,
    );
  }

  try {
    const userId = await resolveSessionUserId(sessionToken);

    if (!userId) {
      return errorResponse(
        "Сессия истекла. Войдите повторно.",
        401,
      );
    }

    const readStatus = async () => {
      const rows = await supabaseRpc<PaymentGroupStatus[]>(
        "get_payment_group_status",
        {
          p_payment_group_id: paymentGroupId,
          p_user_id: userId,
        },
      );

      return Array.isArray(rows) ? rows[0] ?? null : null;
    };

    let group = await readStatus();

    if (!group) {
      return errorResponse("Бронирование не найдено.", 404);
    }

    let syncResult: PaymentSyncResult | null = null;
    let lateRefundProcessingState: string | null = null;

    if (
      group.provider_payment_id &&
      (group.payment_status === "pending" ||
        group.payment_status === "cancelled")
    ) {
      const payment = await getYooKassaPayment(
        group.provider_payment_id,
      );

      syncResult = await syncYooKassaPayment(
        payment,
        paymentGroupId,
      );

      console.info("[payment-status] YooKassa status checked", {
        providerStatus: syncResult.providerStatus,
        databaseResult: syncResult.databaseResult ?? null,
      });

      if (
        syncResult.providerStatus === "succeeded" &&
        syncResult.databaseResult === "late_success_refund_required"
      ) {
        const amountRub = parseWholeRubleAmount(payment.amount);

        if (amountRub === null) {
          throw new Error("Late payment amount is invalid.");
        }

        const refundResult = await processLatePaymentRefund({
          paymentGroupId,
          providerPaymentId: payment.id as string,
          amountRub,
        });

        lateRefundProcessingState = refundResult.state;

        console.info("[payment-status] late payment refund checked", {
          refundState: refundResult.state,
        });
      }

      group = await readStatus();

      if (!group) {
        return errorResponse("Бронирование не найдено.", 404);
      }
    }

    // Read durable refund state independently from the one-time sync result.
    // This also makes refresh/re-entry reliable after the initial webhook.
    const lateRefund = await readLateRefundOperation(
      paymentGroupId,
      userId,
    );

    const transferOperation = await readTransferOperation(
      paymentGroupId,
      userId,
    );

    const baseState =
      group.payment_status === "succeeded"
        ? "succeeded"
        : group.payment_status === "refunded"
          ? "refunded"
          : group.payment_status === "cancelled" ||
              group.payment_status === "failed"
            ? "cancelled"
            : "pending";

    const refundRequired =
      syncResult?.databaseResult ===
      "late_success_refund_required";

    const monitorLatePayment =
      group.payment_status === "cancelled" &&
      Boolean(group.provider_payment_id) &&
      syncResult?.providerStatus === "pending";

    const lateOperation = lateRefund.operation;
    const lateRefundRow = lateRefund.refund;

    const lateRefundManual =
      hasManualResolution(lateOperation?.metadata ?? null);

    const lateRefundRetry =
      hasRefundRetry(lateOperation?.metadata ?? null);

    let lateRefundState: string | null = null;

    if (lateOperation || refundRequired) {
      if (
        lateRefundRow?.status === "succeeded" ||
        lateOperation?.status === "completed" ||
        group.payment_status === "refunded"
      ) {
        lateRefundState = "late_refunded";
      } else if (lateRefundManual || lateOperation?.status === "failed") {
        lateRefundState = "late_refund_review";
      } else if (
        lateRefundRow?.status === "pending" ||
        lateRefundRetry ||
        lateRefundProcessingState === "pending" ||
        lateRefundProcessingState === "retry_required" ||
        lateOperation?.status === "processing"
      ) {
        lateRefundState = "late_refund_pending";
      } else if (lateRefundRow?.status === "cancelled") {
        lateRefundState = "late_refund_review";
      } else {
        lateRefundState = "late_refund_pending";
      }
    }

    let state = baseState;

    if (lateRefundState) {
      state = lateRefundState;
    } else if (transferOperation) {
      if (refundRequired) {
        state = "transfer_refund_required";
      } else if (group.payment_status === "refunded") {
        state = "transfer_refunded";
      } else if (monitorLatePayment) {
        state = "transfer_monitoring";
      } else if (group.payment_status === "succeeded") {
        state =
          transferOperation.status === "completed"
            ? "transfer_completed"
            : "transfer_review";
      } else if (
        group.payment_status === "cancelled" ||
        group.payment_status === "failed"
      ) {
        state =
          transferOperation.status === "failed" ||
          transferOperation.status === "expired"
            ? "transfer_cancelled"
            : "transfer_review";
      } else if (group.payment_status === "pending") {
        state = "transfer_pending";
      } else {
        state = "transfer_review";
      }
    }

    const confirmationMissing =
      !transferOperation &&
      !lateOperation &&
      group.payment_status === "succeeded" &&
      group.booking_count > 0 &&
      group.confirmed_booking_count === 0;

    if (confirmationMissing) {
      state = "review_required";
    }

    return NextResponse.json(
      {
        payment_group_id: group.payment_group_id,
        state,
        amount_rub: group.amount_rub,
        currency: group.currency,
        hold_expires_at: group.hold_expires_at,
        booking_count: group.booking_count,
        confirmed_booking_count: group.confirmed_booking_count,
        payment_initialization_started: Boolean(
          group.payment_init_started_at,
        ),
        monitor_late_payment: monitorLatePayment,
        refund_required: refundRequired,
        confirmation_missing: confirmationMissing,

        purpose: transferOperation
          ? "transfer_adjustment"
          : "booking",

        transfer_status: transferOperation?.status ?? null,
        transfer_completed_at:
          transferOperation?.completed_at ?? null,
        transfer_manual_resolution_required:
          transferOperation
            ? hasManualResolution(transferOperation.metadata)
            : false,

        late_refund_operation_id: lateOperation?.id ?? null,
        late_refund_operation_status: lateOperation?.status ?? null,
        late_refund_status: lateRefundRow?.status ?? null,
        late_refund_amount_rub: lateRefundRow?.amount_rub ?? null,
        late_refund_failure_reason:
          lateRefundRow?.failure_reason ?? null,
        late_refund_succeeded_at:
          lateRefundRow?.succeeded_at ?? null,
        late_refund_retry_required: lateRefundRetry,
        late_refund_manual_resolution_required: lateRefundManual,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[payment-status] lookup failed", {
      errorName: errorName(error),
      httpStatus: errorStatusCode(error),
    });

    return errorResponse(
      "Не удалось проверить статус оплаты. Повторите попытку.",
      503,
    );
  }
}
