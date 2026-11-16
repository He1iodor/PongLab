import {
  createYooKassaRefund,
  getYooKassaRefund,
  listYooKassaRefunds,
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

export type LateRefundResult =
  | { state: "refunded" }
  | { state: "pending" }
  | { state: "retry_required" }
  | { state: "review_required" };

const SAFE_IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60 * 1000;

type ManualReviewReason =
  | "provider_refund_ambiguous"
  | "idempotency_window_expired_without_provider_refund";

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

  if (!Number.isSafeInteger(rubles) || kopecks !== 0) return null;
  return rubles;
}

function validateRefund(
  refund: YooKassaRefund,
  expected: {
    paymentId: string;
    amountRub: number;
    refundId?: string;
  },
) {
  if (
    typeof refund.id !== "string" ||
    refund.id.length < 1 ||
    refund.id.length > 200 ||
    (expected.refundId && refund.id !== expected.refundId) ||
    refund.payment_id !== expected.paymentId ||
    parseProviderAmount(refund) !== expected.amountRub ||
    !["pending", "succeeded", "canceled"].includes(String(refund.status))
  ) {
    throw new Error("YooKassa refund response validation failed.");
  }
}

async function getLocalRefundCreatedAt(refundId: string): Promise<number> {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const supabaseKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase configuration is not available.");
  }

  const url = new URL(`${supabaseUrl}/rest/v1/payment_refunds`);
  url.searchParams.set("select", "created_at");
  url.searchParams.set("id", `eq.${refundId}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(
      `Supabase refund timestamp lookup failed (${response.status}).`,
    );
  }

  const rows: unknown = await response.json();

  if (
    !Array.isArray(rows) ||
    !rows[0] ||
    typeof rows[0].created_at !== "string"
  ) {
    throw new Error("Local refund creation timestamp was not found.");
  }

  const createdAt = Date.parse(rows[0].created_at);
  if (!Number.isFinite(createdAt)) {
    throw new Error("Local refund creation timestamp is invalid.");
  }

  return createdAt;
}

/**
 * Durably records manual review in booking_operations.metadata.
 * The operation becomes failed while the refund row remains pending,
 * preserving the unresolved financial item and blocking another POST.
 */
async function persistManualReview(args: {
  refundId: string;
  reason: ManualReviewReason;
}): Promise<"review_required" | "refunded"> {
  const result = await supabaseRpc<string>(
    "mark_late_payment_refund_review",
    {
      p_refund_id: args.refundId,
      p_reason: args.reason,
    },
  );

  if (result === "review_required") return "review_required";
  if (result === "refunded") return "refunded";

  throw new Error("Manual refund review state was not persisted.");
}

async function findExistingProviderRefund(args: {
  paymentId: string;
  amountRub: number;
}): Promise<
  | { state: "found"; refund: YooKassaRefund }
  | { state: "none" }
  | { state: "ambiguous" }
> {
  const refunds = await listYooKassaRefunds(args.paymentId);

  if (refunds.length === 0) return { state: "none" };
  if (refunds.length !== 1) return { state: "ambiguous" };

  const candidate = refunds[0];

  if (
    candidate.payment_id !== args.paymentId ||
    parseProviderAmount(candidate) !== args.amountRub ||
    typeof candidate.id !== "string"
  ) {
    return { state: "ambiguous" };
  }

  const refund = await getYooKassaRefund(candidate.id);

  validateRefund(refund, {
    paymentId: args.paymentId,
    amountRub: args.amountRub,
    refundId: candidate.id,
  });

  return { state: "found", refund };
}

export async function processLatePaymentRefund(args: {
  paymentGroupId: string;
  providerPaymentId: string;
  amountRub: number;
}): Promise<LateRefundResult> {
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

  if (prepared.state === "refunded") return { state: "refunded" };
  if (prepared.state === "retry_required") return { state: "retry_required" };
  if (prepared.state === "review_required") return { state: "review_required" };

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

  let providerRefund: YooKassaRefund;

  if (typeof prepared.provider_refund_id === "string") {
    providerRefund = await getYooKassaRefund(prepared.provider_refund_id);
  } else {
    const existing = await findExistingProviderRefund({
      paymentId: args.providerPaymentId,
      amountRub: args.amountRub,
    });

    if (existing.state === "found") {
      providerRefund = existing.refund;
    } else if (existing.state === "ambiguous") {
      console.error(
        "[yookassa-late-refund] existing provider refunds are ambiguous",
        { paymentGroupId: args.paymentGroupId },
      );

      return {
        state: await persistManualReview({
          refundId: prepared.refund_id,
          reason: "provider_refund_ambiguous",
        }),
      };
    } else {
      const createdAt = await getLocalRefundCreatedAt(prepared.refund_id);
      const ageMs = Date.now() - createdAt;

      if (ageMs < 0) {
        throw new Error("Local refund creation timestamp is in the future.");
      }

      if (ageMs >= SAFE_IDEMPOTENCY_WINDOW_MS) {
        console.error(
          "[yookassa-late-refund] idempotency window exceeded without provider refund",
          {
            paymentGroupId: args.paymentGroupId,
            refundAgeHours: Math.floor(ageMs / (60 * 60 * 1000)),
          },
        );

        return {
          state: await persistManualReview({
            refundId: prepared.refund_id,
            reason: "idempotency_window_expired_without_provider_refund",
          }),
        };
      }

      providerRefund = await createYooKassaRefund({
        paymentId: args.providerPaymentId,
        amountRub: args.amountRub,
        idempotencyKey: prepared.idempotency_key as string,
      });
    }
  }

  validateRefund(providerRefund, {
    paymentId: args.providerPaymentId,
    amountRub: args.amountRub,
    refundId: prepared.provider_refund_id ?? undefined,
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

  if (result === "refunded") return { state: "refunded" };
  if (result === "retry_required") return { state: "retry_required" };
  if (result === "pending" || result === "refund_recorded") {
    return { state: "pending" };
  }

  throw new Error("Late payment refund finalization was not confirmed.");
}
