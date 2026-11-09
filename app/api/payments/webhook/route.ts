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

export async function POST(request: NextRequest) {
  // YooKassa publishes the supported source IP ranges in its webhook guide.
  // Vercel provides the client address in x-real-ip.
  const sourceIp = request.headers.get("x-real-ip")?.trim() ?? null;
  if (!isYooKassaWebhookIp(sourceIp)) {
    return response(403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response(400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return response(400);
  }

  const payload = body as Record<string, unknown>;
  const event = payload.event;
  const object = payload.object;

  // The webhook endpoint subscribes only to payment.succeeded and payment.canceled.
  if (event !== "payment.succeeded" && event !== "payment.canceled") {
    return response(200);
  }

  if (!object || typeof object !== "object" || Array.isArray(object)) {
    return response(400);
  }

  const paymentId = (object as Record<string, unknown>).id;
  if (typeof paymentId !== "string" || paymentId.length > 128) {
    return response(400);
  }

  try {
    // Never trust the status or amount in the notification body.
    // Fetch the current payment directly from YooKassa and validate metadata,
    // amount, currency and final status before changing booking records.
    const payment = await getYooKassaPayment(paymentId);
    const groupId = payment.metadata?.payment_group_id;
    if (!isUuid(groupId)) {
      console.error("YooKassa webhook payment has no valid group metadata.");
      return response(200);
    }

    if (payment.id !== paymentId) {
      console.error("YooKassa webhook payment ID mismatch.");
      return response(200);
    }

    const syncResult = await syncYooKassaPayment(payment, groupId);
    if (syncResult.providerStatus === "pending") {
      // The notification may have arrived before the status transition became
      // visible in the API. Ask YooKassa to retry instead of acknowledging it.
      return response(503);
    }

    return response(200);
  } catch {
    // Non-200 asks YooKassa to retry delivery after transient failures.
    console.error("YooKassa webhook processing failed.");
    return response(503);
  }
}
