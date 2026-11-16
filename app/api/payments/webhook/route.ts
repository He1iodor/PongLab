
import { NextRequest, NextResponse } from "next/server";
import {
  getYooKassaPayment,
  isYooKassaWebhookIp,
  isUuid,
  parseWholeRubleAmount,
  syncYooKassaPayment,
} from "@/lib/yookassa";
import { processLatePaymentRefund } from "@/lib/yookassa-late-refunds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(status: number) {
  return new NextResponse(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
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
    // Notification payload is not trusted. Read authoritative payment data.
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
