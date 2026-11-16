
import {
  createYooKassaRefund,
  getYooKassaRefund,
  type YooKassaRefund,
} from "@/lib/yookassa-refunds";
import { supabaseRpc } from "@/lib/yookassa";

type PreparedRefund = {
  state?: string;
  operation_id?: string;
  refund_id?: string;
  idempotency_key?: string;
  provider_refund_id?: string | null;
  provider_payment_id?: string;
  amount_rub?: number;
};

type RefundResult =
  | { state: "refunded" }
  | { state: "pending" }
  | { state: "retry_required" };

function parseProviderAmount(refund: YooKassaRefund): number | null {
  const amount = refund.amount;

  if (
    !amount ||
    amount.currency !== "RUB" ||
    typeof amount.value !== "string"
  ) {
    return null;
  }

  const match = amount.value.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;

  const rubles = Number(match[1]);
  const kopecks = Number((match[2] ?? "").padEnd(2, "0") || "0");

  if (!Number.isSafeInteger(rubles) || kopecks !== 0) {
    return null;
  }

  return rubles;
}

function validateRefund(
  refund: YooKassaRefund,
  expected: {
    paymentId: string;
    amountRub: number;
  },
) {
  if (
    typeof refund.id !== "string" ||
    refund.id.length < 1 ||
    refund.id.length > 200 ||
    refund.payment_id !== expected.paymentId ||
    parseProviderAmount(refund) !== expected.amountRub ||
    !["pending", "succeeded", "canceled"].includes(
      String(refund.status),
    )
  ) {
    throw new Error("YooKassa refund response validation failed.");
  }
}

export async function processLatePaymentRefund(args: {
  paymentGroupId: string;
  providerPaymentId: string;
  amountRub: number;
}): Promise<RefundResult> {
  if (
    !args.paymentGroupId ||
    !args.providerPaymentId ||
    !Number.isSafeInteger(args.amountRub) ||
    args.amountRub <= 0
  ) {
    throw new Error("Invalid late payment refund arguments.");
  }

  const prepared = await supabaseRpc<PreparedRefund>(
    "prepare_late_payment_refund",
    {
      p_payment_group_id: args.paymentGroupId,
      p_provider_payment_id: args.providerPaymentId,
      p_amount_rub: args.amountRub,
    },
  );

  if (!prepared || typeof prepared !== "object") {
    throw new Error("Invalid late payment refund preparation response.");
  }

  if (prepared.state === "refunded") {
    return { state: "refunded" };
  }

  if (
    prepared.state !== "pending" ||
    typeof prepared.refund_id !== "string" ||
    typeof prepared.provider_payment_id !== "string" ||
    typeof prepared.amount_rub !== "number"
  ) {
    throw new Error("Late payment refund is not ready for processing.");
  }

  if (
    prepared.provider_payment_id !== args.providerPaymentId ||
    prepared.amount_rub !== args.amountRub
  ) {
    throw new Error("Prepared refund does not match the late payment.");
  }

  if (
    typeof prepared.provider_refund_id !== "string" &&
    typeof prepared.idempotency_key !== "string"
  ) {
    throw new Error("Refund idempotency data is missing.");
  }

  // If YooKassa already returned a refund ID, inspect that refund.
  // Otherwise repeat POST with the same persisted idempotency key.
  // A network error deliberately leaves the DB row pending.
  const providerRefund =
    typeof prepared.provider_refund_id === "string"
      ? await getYooKassaRefund(prepared.provider_refund_id)
      : await createYooKassaRefund({
          paymentId: args.providerPaymentId,
          amountRub: args.amountRub,
          idempotencyKey: prepared.idempotency_key as string,
        });

  validateRefund(providerRefund, {
    paymentId: args.providerPaymentId,
    amountRub: args.amountRub,
  });

  const result = await supabaseRpc<string>(
    "finalize_late_payment_refund",
    {
      p_refund_id: prepared.refund_id,
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

  if (result === "refunded") {
    return { state: "refunded" };
  }

  if (result === "retry_required") {
    return { state: "retry_required" };
  }

  if (result === "pending" || result === "refund_recorded") {
    return { state: "pending" };
  }

  throw new Error("Late payment refund finalization was not confirmed.");
}
