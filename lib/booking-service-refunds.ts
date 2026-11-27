import { supabaseRpc } from "@/lib/yookassa";
import {
  createYooKassaRefund,
  getYooKassaRefund,
  type YooKassaRefund,
} from "@/lib/yookassa-refunds";

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
  idempotency_key: string;
};

type PrepareServiceRefundResult = {
  state?: string;
  operation_id?: string;
  refund_ids?: unknown;
};

export type BookingServiceRefundResult = {
  state: "no_services" | "completed" | "processing" | "retry_required";
  refundIds: string[];
};

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

async function getRefundRow(refundId: string): Promise<PaymentRefundRow | null> {
  const config = getConfig();
  if (!config) throw new Error("Supabase configuration is unavailable.");

  const target = new URL(`${config.url}/rest/v1/payment_refunds`);
  target.searchParams.set(
    "select",
    "id,booking_operation_id,payment_group_id,provider,provider_payment_id,provider_refund_id,amount_rub,currency,status,idempotency_key",
  );
  target.searchParams.set("id", `eq.${refundId}`);
  target.searchParams.set("limit", "2");

  const response = await fetch(target, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    console.error("[service-refund] refund lookup failed", {
      status: response.status,
    });
    throw new Error("Не удалось проверить состояние возврата услуги.");
  }

  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.length > 1) {
    throw new Error("Некорректный ответ базы данных при проверке возврата.");
  }

  return (rows[0] as PaymentRefundRow | undefined) ?? null;
}

function validateProviderRefund(
  refund: YooKassaRefund,
  row: PaymentRefundRow,
): asserts refund is YooKassaRefund & {
  id: string;
  payment_id: string;
  status: "pending" | "succeeded" | "canceled";
} {
  const amount = refund.amount as { value?: unknown; currency?: unknown } | undefined;
  let amountRub: number | null = null;
  if (amount?.currency === "RUB" && typeof amount.value === "string") {
    const match = amount.value.match(/^(\d+)(?:\.(\d{1,2}))?$/);
    if (match) {
      const rubles = Number(match[1]);
      const kopecks = Number((match[2] ?? "").padEnd(2, "0") || "0");
      if (Number.isSafeInteger(rubles) && kopecks === 0) amountRub = rubles;
    }
  }

  if (
    typeof refund.id !== "string" ||
    refund.id.length < 1 ||
    refund.id.length > 200 ||
    refund.payment_id !== row.provider_payment_id ||
    amountRub !== row.amount_rub ||
    !["pending", "succeeded", "canceled"].includes(String(refund.status))
  ) {
    throw new Error("YooKassa service refund response validation failed.");
  }
}

/**
 * Prepares service refund allocations in Postgres and starts/verifies each
 * YooKassa refund with its persisted idempotency key. Safe to call repeatedly
 * from both the cancellation API and the payment webhook.
 */
export async function prepareAndStartBookingServiceRefund(
  bookingId: string,
): Promise<BookingServiceRefundResult> {
  if (!isUuid(bookingId)) throw new Error("Invalid booking ID for service refund.");

  const prepared = await supabaseRpc<PrepareServiceRefundResult>(
    "prepare_customer_booking_service_refund",
    { p_booking_id: bookingId },
  );

  if (!prepared || typeof prepared !== "object") {
    throw new Error("Service refund preparation returned an invalid response.");
  }

  const state = prepared.state;
  const refundIds = Array.isArray(prepared.refund_ids)
    ? prepared.refund_ids.filter(isUuid)
    : [];

  if (state === "no_services") {
    return { state: "no_services", refundIds: [] };
  }

  if (state === "completed") {
    return { state: "completed", refundIds: [] };
  }

  if (state !== "processing" || refundIds.length === 0) {
    return { state: "retry_required", refundIds };
  }

  let hasPending = false;
  let needsRetry = false;

  for (const refundId of refundIds) {
    const row = await getRefundRow(refundId);
    if (!row || row.id !== refundId) {
      throw new Error("Service refund row was not found.");
    }

    if (
      !isUuid(row.booking_operation_id) ||
      !isUuid(row.payment_group_id) ||
      row.provider !== "yookassa" ||
      row.currency !== "RUB" ||
      !Number.isSafeInteger(row.amount_rub) ||
      row.amount_rub < 1 ||
      !isUuid(row.idempotency_key)
    ) {
      throw new Error("Service refund row failed local validation.");
    }

    if (row.status === "succeeded") continue;
    if (row.status === "cancelled" || row.status === "failed") {
      needsRetry = true;
      continue;
    }
    if (row.status !== "pending") {
      throw new Error("Unsupported local service refund state.");
    }

    const providerRefund = row.provider_refund_id
      ? await getYooKassaRefund(row.provider_refund_id)
      : await createYooKassaRefund({
          paymentId: row.provider_payment_id,
          amountRub: row.amount_rub,
          idempotencyKey: row.idempotency_key,
        });

    validateProviderRefund(providerRefund, row);

    const databaseResult = await supabaseRpc<string>(
      "finalize_customer_booking_service_refund",
      {
        p_refund_id: row.id,
        p_provider_refund_id: providerRefund.id,
        p_provider_status: providerRefund.status,
        p_provider_response: {
          id: providerRefund.id,
          payment_id: providerRefund.payment_id,
          status: providerRefund.status,
          amount: providerRefund.amount,
        },
      },
    );

    if (databaseResult === "pending") {
      hasPending = true;
    } else if (databaseResult === "retry_required") {
      needsRetry = true;
    } else if (
      databaseResult !== "completed" &&
      databaseResult !== "already_completed" &&
      databaseResult !== "refund_recorded"
    ) {
      throw new Error("Unexpected service refund finalization result.");
    }
  }

  if (needsRetry) return { state: "retry_required", refundIds };
  if (hasPending) return { state: "processing", refundIds };

  // The SQL prepare RPC returns pending rows. If all were synchronized as
  // succeeded, the finalizer has completed the operation or recorded its last
  // successful source. A subsequent call confirms the aggregate state.
  const confirmation = await supabaseRpc<PrepareServiceRefundResult>(
    "prepare_customer_booking_service_refund",
    { p_booking_id: bookingId },
  );

  if (confirmation?.state === "completed" || confirmation?.state === "no_services") {
    return {
      state: confirmation.state,
      refundIds,
    };
  }

  return { state: "processing", refundIds };
}
