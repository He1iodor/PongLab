import { NextRequest, NextResponse } from "next/server";
import {
  createYooKassaPayment,
  getSessionTokenFromRequest,
  getYooKassaPayment,
  isUuid,
  parseWholeRubleAmount,
  resolveSessionUserId,
  supabaseRpc,
  syncYooKassaPayment,
  type YooKassaPayment,
  YooKassaApiError,
} from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BeginPaymentResult = {
  state?: string;
  payment_group_id?: string;
  provider_payment_id?: string | null;
  payment_url?: string | null;
  amount_rub?: number;
  currency?: string;
  provider?: string;
  idempotency_key?: string;
  payment_init_started_at?: string;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function getConfirmationUrl(payment: YooKassaPayment): string | null {
  const value = payment.confirmation?.confirmation_url;
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function returnIfAlreadyFinished(
  payment: YooKassaPayment,
  paymentGroupId: string,
) {
  const synced = await syncYooKassaPayment(payment, paymentGroupId);

  if (synced.providerStatus === "succeeded") {
    return NextResponse.json(
      { state: "succeeded", payment_group_id: paymentGroupId },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (synced.providerStatus === "canceled") {
    return errorResponse(
      "Платёж отменён. Создайте новый резерв и повторите оплату.",
      409,
    );
  }

  const confirmationUrl = getConfirmationUrl(payment);
  if (!confirmationUrl) {
    return errorResponse("YooKassa не вернула ссылку для оплаты. Повторите попытку.", 502);
  }

  return NextResponse.json(
    {
      state: "pending",
      payment_group_id: paymentGroupId,
      confirmation_url: confirmationUrl,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("Недопустимый запрос.", 403);
  }

  const sessionToken = getSessionTokenFromRequest(request);
  if (!sessionToken) {
    return errorResponse("Войдите в личный кабинет.", 401);
  }

  let userId: string | null;
  try {
    userId = await resolveSessionUserId(sessionToken);
  } catch {
    return errorResponse("Не удалось проверить сессию. Повторите попытку.", 503);
  }

  if (!userId) {
    return errorResponse("Сессия истекла. Войдите в личный кабинет повторно.", 401);
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

  const paymentGroupId = (body as Record<string, unknown>).payment_group_id;
  if (!isUuid(paymentGroupId)) {
    return errorResponse("Некорректный идентификатор бронирования.", 400);
  }

  try {
    const begin = await supabaseRpc<BeginPaymentResult>(
      "begin_payment_initialization",
      {
        p_payment_group_id: paymentGroupId,
        p_user_id: userId,
      },
    );

    if (!begin || typeof begin.state !== "string") {
      return errorResponse("Не удалось начать оплату. Обновите бронирование.", 409);
    }

    if (begin.state === "succeeded") {
      return NextResponse.json(
        { state: "succeeded", payment_group_id: paymentGroupId },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (begin.state === "payment_created") {
      if (typeof begin.provider_payment_id !== "string") {
        return errorResponse("Не удалось найти созданный платёж. Обратитесь в поддержку.", 503);
      }

      const existingPayment = await getYooKassaPayment(begin.provider_payment_id);
      const expectedAmount = Number(begin.amount_rub);
      if (
        parseWholeRubleAmount(existingPayment.amount) !== expectedAmount ||
        existingPayment.metadata?.payment_group_id !== paymentGroupId
      ) {
        return errorResponse("Данные платежа не совпадают с бронированием. Обратитесь в поддержку.", 409);
      }

      return await returnIfAlreadyFinished(existingPayment, paymentGroupId);
    }

    if (begin.state !== "started" && begin.state !== "retry_same_request") {
      return errorResponse("Бронирование не готово к оплате. Обновите страницу.", 409);
    }

    if (
      typeof begin.amount_rub !== "number" ||
      !Number.isSafeInteger(begin.amount_rub) ||
      begin.amount_rub <= 0 ||
      begin.currency !== "RUB" ||
      !isUuid(begin.idempotency_key)
    ) {
      return errorResponse("База данных вернула некорректные параметры оплаты.", 503);
    }

    // YooKassa гарантирует идемпотентность 24 часа. После 23 часов
    // автоматический повтор намеренно блокируем, чтобы не создать второй платёж.
    if (begin.state === "retry_same_request") {
      const startedAt = Date.parse(begin.payment_init_started_at ?? "");
      if (!Number.isFinite(startedAt) || Date.now() - startedAt > 23 * 60 * 60 * 1000) {
        return errorResponse(
          "Срок безопасного повтора запроса оплаты истёк. Не создавайте новый платёж самостоятельно — обратитесь в поддержку для сверки.",
          409,
        );
      }
    }

    let payment: YooKassaPayment;
    try {
      payment = await createYooKassaPayment({
        idempotencyKey: begin.idempotency_key,
        amountRub: begin.amount_rub,
        paymentGroupId,
        userId,
      });
    } catch (error) {
      // A definitive 4xx means YooKassa rejected the request. A 429 can be
      // retried, and 5xx/network errors are ambiguous, so those holds remain
      // locked and retry with the same idempotency key.
      if (
        error instanceof YooKassaApiError &&
        error.statusCode >= 400 &&
        error.statusCode < 500 &&
        error.statusCode !== 429
      ) {
        await supabaseRpc("apply_payment_group_failure", {
          p_payment_group_id: paymentGroupId,
          p_final_status: "failed",
          p_provider_payment_id: null,
          p_failure_reason: `yookassa_http_${error.statusCode}`,
        });
        return errorResponse(
          "YooKassa отклонила создание платежа. Резерв освобождён; проверьте настройки магазина и создайте новое бронирование.",
          502,
        );
      }
      throw error;
    }

    if (
      typeof payment.id !== "string" ||
      parseWholeRubleAmount(payment.amount) !== begin.amount_rub ||
      payment.amount?.currency !== "RUB" ||
      payment.metadata?.payment_group_id !== paymentGroupId ||
      payment.metadata?.user_id !== userId
    ) {
      console.error("YooKassa create response did not match the payment group.");
      return errorResponse("Ответ платёжного сервиса не прошёл проверку. Обратитесь в поддержку.", 502);
    }

    const synced = await syncYooKassaPayment(payment, paymentGroupId);
    if (synced.providerStatus === "succeeded") {
      return NextResponse.json(
        { state: "succeeded", payment_group_id: paymentGroupId },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (synced.providerStatus === "canceled") {
      return errorResponse("Платёж был отменён. Создайте новый резерв.", 409);
    }

    const confirmationUrl = getConfirmationUrl(payment);
    if (!confirmationUrl) {
      return errorResponse("YooKassa не вернула ссылку для оплаты.", 502);
    }

    let saveResult: { success?: boolean; state?: string } | null = null;
    try {
      saveResult = await supabaseRpc<{
        success?: boolean;
        state?: string;
      }>("save_yookassa_payment", {
        p_payment_group_id: paymentGroupId,
        p_provider_payment_id: payment.id,
        p_payment_url: confirmationUrl,
        p_amount_rub: begin.amount_rub,
        p_currency: "RUB",
      });
    } catch {
      // A webhook can beat this response and confirm the group before the
      // create route saves the redirect URL. Re-read the owner-scoped state.
      try {
        const statusRows = await supabaseRpc<Array<{ payment_status: string }>>(
          "get_payment_group_status",
          { p_payment_group_id: paymentGroupId, p_user_id: userId },
        );
        if (statusRows[0]?.payment_status === "succeeded") {
          return NextResponse.json(
            { state: "succeeded", payment_group_id: paymentGroupId },
            { headers: { "Cache-Control": "no-store" } },
          );
        }
        if (["cancelled", "failed"].includes(statusRows[0]?.payment_status ?? "")) {
          return errorResponse("Платёж отменён. Создайте новый резерв.", 409);
        }
      } catch {
        // Fall through to the safe retry message below.
      }
    }

    if (!saveResult?.success) {
      console.error("YooKassa payment was created but was not saved in Supabase.");
      return errorResponse(
        "Платёж создан, но сервер не подтвердил его сохранение. Не создавайте новый резерв; повторите эту же оплату через личный кабинет или обратитесь в поддержку.",
        503,
      );
    }

    return NextResponse.json(
      {
        state: "pending",
        payment_group_id: paymentGroupId,
        confirmation_url: confirmationUrl,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error("Payment creation flow failed.");
    return errorResponse("Не удалось начать оплату. Повторите попытку позже.", 503);
  }
}
