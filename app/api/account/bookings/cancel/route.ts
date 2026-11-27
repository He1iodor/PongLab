import { NextRequest, NextResponse } from "next/server";
import { processBookingCancellation } from "@/lib/booking-cancellation-core";
import { prepareAndStartBookingServiceRefund } from "@/lib/booking-service-refunds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const bodyRequest = request.clone();
  const response = await processBookingCancellation(request);

  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await bodyRequest.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    return response;
  }

  const bookingId = body?.booking_id;
  if (typeof bookingId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)) {
    return response;
  }

  let resultBody: unknown;
  try { resultBody = await response.clone().json(); } catch { return response; }
  if (!resultBody || typeof resultBody !== "object" || Array.isArray(resultBody)) return response;

  const result = resultBody as Record<string, unknown>;
  if (!response.ok || (result.state !== "completed" && result.state !== "cancelled")) return response;

  try {
    const serviceRefund = await prepareAndStartBookingServiceRefund(bookingId);
    return NextResponse.json(
      {
        ...result,
        service_refund_state: serviceRefund.state,
        service_refund_ids: serviceRefund.refundIds,
        message:
          serviceRefund.state === "processing"
            ? "Бронирование отменено. Возврат стоимости услуг обрабатывается отдельно."
            : serviceRefund.state === "retry_required"
              ? "Бронирование отменено. Возврат стоимости услуг требует повторной проверки."
              : result.message,
      },
      { status: response.status, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[booking-cancel] service refund processing failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      {
        ...result,
        service_refund_state: "processing",
        message: "Бронирование отменено. Возврат стоимости услуг ожидает повторной проверки.",
      },
      { status: response.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
