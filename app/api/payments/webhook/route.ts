import { NextRequest, NextResponse } from "next/server";
import {
  getYooKassaPayment,
  isYooKassaWebhookIp,
  isUuid,
  syncYooKassaPayment,
} from "@/lib/yookassa";

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
  // x-real-ip is supplied by Vercel. Do not trust an arbitrary client-supplied
  // forwarded-for value as a fallback for the IP allowlist.
  const sourceIp = request.headers.get("x-real-ip")?.trim() ?? null;
  const ipAllowed = isYooKassaWebhookIp(sourceIp);

  // Log only whether an address was supplied and whether it passed the
  // allowlist. Do not store the visitor's full IP address in application logs.
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

  // The webhook endpoint subscribes only to payment.succeeded and payment.canceled.
  if (event !== "payment.succeeded" && event !== "payment.canceled") {
    console.info("[yookassa-webhook] ignored event", {
      event: typeof event === "string" ? event : "invalid",
    });
    return response(200);
  }

  console.info("[yookassa-webhook] supported event received", { event });

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

  // Use only a short suffix to correlate logs without storing the full ID.
  const paymentIdSuffix = paymentId.slice(-8);

  try {
    // Never trust the status or amount in the notification body.
    // Fetch the current payment directly from YooKassa and validate metadata,
    // amount, currency and final status before changing booking records.
    const payment = await getYooKassaPayment(paymentId);

    const providerStatus =
      typeof payment.status === "string" ? payment.status : "invalid";
    const cancellationReason =
      typeof payment.cancellation_details?.reason === "string"
        ? payment.cancellation_details.reason
        : null;

    console.info("[yookassa-webhook] provider response received", {
      event,
      paymentIdSuffix,
      providerStatus,
      cancellationReason,
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
      // The notification may have arrived before the status transition became
      // visible in the API. Ask YooKassa to retry delivery instead of acknowledging it.
      console.warn("[yookassa-webhook] provider status is still pending; requesting retry", {
        event,
        paymentIdSuffix,
      });
      return response(503);
    }

    return response(200);
  } catch (error) {
    // Do not log payment payloads, credentials, request URLs, or full IDs.
    // Non-200 asks YooKassa to retry delivery after transient failures.
    console.error("[yookassa-webhook] processing failed", {
      event,
      paymentIdSuffix,
      errorName: errorName(error),
    });
    return response(503);
  }
}
