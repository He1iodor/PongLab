import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTokenFromRequest,
  getYooKassaPayment,
  isUuid,
  resolveSessionUserId,
  supabaseRpc,
  syncYooKassaPayment,
} from "@/lib/yookassa";

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

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const sessionToken = getSessionTokenFromRequest(request);
  if (!sessionToken) return errorResponse("Войдите в личный кабинет.", 401);

  const paymentGroupId = request.nextUrl.searchParams.get("payment_group_id");
  if (!isUuid(paymentGroupId)) {
    return errorResponse("Некорректный идентификатор бронирования.", 400);
  }

  try {
    const userId = await resolveSessionUserId(sessionToken);
    if (!userId) return errorResponse("Сессия истекла. Войдите повторно.", 401);

    const readStatus = async () => {
      const rows = await supabaseRpc<PaymentGroupStatus[]>("get_payment_group_status", {
        p_payment_group_id: paymentGroupId,
        p_user_id: userId,
      });
      return Array.isArray(rows) ? rows[0] ?? null : null;
    };

    let group = await readStatus();
    if (!group) return errorResponse("Бронирование не найдено.", 404);

    if (group.payment_status === "pending" && group.provider_payment_id) {
      const payment = await getYooKassaPayment(group.provider_payment_id);
      await syncYooKassaPayment(payment, paymentGroupId);
      group = await readStatus();
      if (!group) return errorResponse("Бронирование не найдено.", 404);
    }

    const state = group.payment_status === "succeeded"
      ? "succeeded"
      : group.payment_status === "cancelled" || group.payment_status === "failed"
        ? "cancelled"
        : "pending";

    return NextResponse.json(
      {
        payment_group_id: group.payment_group_id,
        state,
        amount_rub: group.amount_rub,
        currency: group.currency,
        hold_expires_at: group.hold_expires_at,
        booking_count: group.booking_count,
        confirmed_booking_count: group.confirmed_booking_count,
        payment_initialization_started: Boolean(group.payment_init_started_at),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error("Payment status lookup failed.");
    return errorResponse("Не удалось проверить статус оплаты. Повторите попытку.", 503);
  }
}
