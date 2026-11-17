import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTokenFromRequest,
  isUuid,
  isYooKassaReadyForPayments,
  resolveSessionUserId,
  supabaseRpc,
} from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("Недопустимый запрос.", 403);
  }

  if (!isYooKassaReadyForPayments()) {
    return errorResponse("Онлайн-оплата временно недоступна.", 503);
  }

  const token = getSessionTokenFromRequest(request);
  if (!token) return errorResponse("Войдите в личный кабинет.", 401);

  let userId: string | null;
  try {
    userId = await resolveSessionUserId(token);
  } catch {
    return errorResponse("Не удалось проверить сессию.", 503);
  }
  if (!userId) return errorResponse("Сессия истекла. Войдите повторно.", 401);

  let body: unknown;
  try { body = await request.json(); }
  catch { return errorResponse("Некорректный запрос.", 400); }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Некорректный запрос.", 400);
  }

  const operationId = (body as Record<string, unknown>).operation_id;
  if (!isUuid(operationId)) return errorResponse("Некорректное предложение.", 400);

  try {
    const result = await supabaseRpc<{
      state?: string;
      operation_id?: string;
      payment_group_id?: string;
      amount_rub?: number;
      hold_expires_at?: string;
    }>("accept_booking_extension_offer", {
      p_operation_id: operationId,
      p_user_id: userId,
    });

    if (
      !result ||
      result.state !== "awaiting_payment" ||
      !isUuid(result.payment_group_id) ||
      typeof result.amount_rub !== "number" ||
      !Number.isSafeInteger(result.amount_rub) ||
      result.amount_rub < 1
    ) {
      return errorResponse("Предложение больше недоступно. Обновите бронирования.", 409);
    }

    return NextResponse.json({
      state: result.state,
      operation_id: result.operation_id,
      payment_group_id: result.payment_group_id,
      amount_rub: result.amount_rub,
      hold_expires_at: result.hold_expires_at ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.warn("Extension offer acceptance rejected:", error);
    return errorResponse("Предложение больше недоступно или следующий час уже занят.", 409);
  }
}
