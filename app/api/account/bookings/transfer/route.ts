import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTokenFromRequest,
  resolveSessionUserId,
  supabaseRpc,
} from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TransferPreparation = {
  state?: string;
  operation_id?: string;
  payment_group_id?: string | null;
  price_difference_rub?: number;
  target_price_rub?: number;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("Недопустимый запрос.", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Некорректный запрос.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Некорректный запрос.", 400);
  }

  const payload = body as Record<string, unknown>;
  const bookingId = payload.booking_id;
  const targetStudioId = payload.target_studio_id;
  const targetStartAt = payload.target_start_at;
  const idempotencyKey = payload.idempotency_key;

  if (!isUuid(bookingId) || !isUuid(targetStudioId)) {
    return errorResponse("Укажите корректное бронирование и клуб.", 400);
  }

  if (
    typeof targetStartAt !== "string" ||
    targetStartAt.length > 64 ||
    !/(Z|[+-]\d{2}:\d{2})$/i.test(targetStartAt) ||
    !Number.isFinite(Date.parse(targetStartAt))
  ) {
    return errorResponse("Укажите время начала слота с часовым поясом.", 400);
  }

  if (
    typeof idempotencyKey !== "string" ||
    idempotencyKey.length < 1 ||
    idempotencyKey.length > 200
  ) {
    return errorResponse("Некорректный ключ операции.", 400);
  }

  const sessionToken = getSessionTokenFromRequest(request);
  if (!sessionToken) return errorResponse("Войдите в личный кабинет.", 401);

  try {
    const userId = await resolveSessionUserId(sessionToken);
    if (!userId) return errorResponse("Сессия истекла. Войдите повторно.", 401);

    // Dispatch сохраняет прежний денежный сценарий для cash-брони и отдельно
    // обрабатывает pass-funded перенос без доплаты и смены города.
    const result = await supabaseRpc<TransferPreparation>(
      "prepare_customer_booking_transfer_dispatch",
      {
        p_booking_id: bookingId,
        p_user_id: userId,
        p_target_studio_id: targetStudioId,
        p_target_start_at: targetStartAt,
        p_idempotency_key: idempotencyKey,
      },
    );

    if (!result || typeof result.state !== "string" || !isUuid(result.operation_id)) {
      return errorResponse("Не удалось подготовить перенос.", 409);
    }

    if (result.state === "completed") {
      return NextResponse.json(
        {
          success: true,
          state: "completed",
          operation_id: result.operation_id,
          price_difference_rub: 0,
          target_price_rub: result.target_price_rub,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (result.state === "awaiting_payment") {
      if (!isUuid(result.payment_group_id)) {
        return errorResponse("Перенос подготовлен, но платёжная группа не найдена.", 503);
      }
      return NextResponse.json(
        {
          success: true,
          state: "awaiting_payment",
          operation_id: result.operation_id,
          payment_group_id: result.payment_group_id,
          price_difference_rub: result.price_difference_rub,
          target_price_rub: result.target_price_rub,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (result.state === "processing" && typeof result.price_difference_rub === "number" && result.price_difference_rub < 0) {
      return NextResponse.json(
        {
          success: true,
          state: "processing",
          operation_id: result.operation_id,
          price_difference_rub: result.price_difference_rub,
          refund_required_rub: Math.abs(result.price_difference_rub),
          target_price_rub: result.target_price_rub,
          next_action: "POST /api/account/bookings/transfer/refund",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return errorResponse("Перенос находится в неподдерживаемом состоянии. Обновите бронирование.", 409);
  } catch (error) {
    console.error("[booking-transfer] preparation failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse("Не удалось подготовить перенос. Исходное бронирование не изменено.", 503);
  }
}
