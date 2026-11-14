import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTokenFromRequest,
  resolveSessionUserId,
  supabaseRpc,
} from "@/lib/yookassa";
import {
  createYooKassaRefund,
  getYooKassaRefund,
  type YooKassaRefund,
} from "@/lib/yookassa-refunds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RefundRow = {
  id: string;
  payment_group_id: string;
  provider: string;
  provider_payment_id: string;
  provider_refund_id: string | null;
  amount_rub: number;
  currency: string;
  status: string;
  idempotency_key: string;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

async function getRefundRow(refundId: string): Promise<RefundRow | null> {
  const config = getConfig();
  if (!config) throw new Error("Supabase configuration is unavailable.");

  const target = new URL(`${config.url}/rest/v1/payment_refunds`);
  target.searchParams.set(
    "select",
    "id,payment_group_id,provider,provider_payment_id,provider_refund_id,amount_rub,currency,status,idempotency_key",
  );
  target.searchParams.set("id", `eq.${refundId}`);
  target.searchParams.set("limit", "1");

  const response = await fetch(target, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    console.error("[booking-transfer-refund] refund lookup failed", {
      status: response.status,
    });
    throw new Error("Не удалось проверить состояние возврата.");
  }

  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error("Некорректный ответ базы данных.");
  }

  return (rows[0] as RefundRow | undefined) ?? null;
}

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

function validateProviderRefund(refund: YooKassaRefund, row: RefundRow) {
  if (
    typeof refund.id !== "string" ||
    refund.id.length === 0 ||
    refund.id.length > 200 ||
    refund.payment_id !== row.provider_payment_id ||
    parseProviderAmount(refund) !== row.amount_rub ||
    !["pending", "succeeded", "canceled"].includes(String(refund.status))
  ) {
    throw new Error("YooKassa refund response validation failed.");
  }
}

async function synchronizeRefund(
  refund: YooKassaRefund,
  row: RefundRow,
): Promise<string> {
  validateProviderRefund(refund, row);

  return supabaseRpc<string>("finalize_customer_booking_transfer_refund", {
    p_refund_id: row.id,
    p_provider_refund_id: refund.id,
    p_provider_status: refund.status,
    p_provider_response: {
      id: refund.id,
      payment_id: refund.payment_id,
      status: refund.status,
      amount: refund.amount,
    },
  });
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

  const operationId = (body as Record<string, unknown>).operation_id;
  if (
    typeof operationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      operationId,
    )
  ) {
    return errorResponse("Укажите корректную операцию переноса.", 400);
  }

  const sessionToken = getSessionTokenFromRequest(request);
  if (!sessionToken) {
    return errorResponse("Войдите в личный кабинет.", 401);
  }

  try {
    const userId = await resolveSessionUserId(sessionToken);
    if (!userId) {
      return errorResponse("Сессия истекла. Войдите повторно.", 401);
    }

    const prepared = await supabaseRpc<Record<string, unknown>>(
      "prepare_customer_booking_transfer_refunds",
      {
        p_operation_id: operationId,
        p_user_id: userId,
      },
    );

    if (!prepared || typeof prepared.operation_id !== "string") {
      return errorResponse("Не удалось подготовить возврат.", 409);
    }

    if (prepared.state === "completed") {
      return NextResponse.json(
        { success: true, state: "completed" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const refundIds = Array.isArray(prepared.refund_ids)
      ? prepared.refund_ids.filter(
          (id): id is string =>
            typeof id === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              id,
            ),
        )
      : [];

    if (refundIds.length === 0) {
      return NextResponse.json(
        {
          success: true,
          state: "processing",
          message:
            "Возврат ожидает проверки. Исходное бронирование пока не изменено.",
        },
        {
          status: 202,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    let hasPending = false;
    let needsRetry = false;
    let completed = false;
    let manualResolutionRequired = false;

    for (const refundId of refundIds) {
      const row = await getRefundRow(refundId);
      if (!row) throw new Error("Операция возврата не найдена.");

      if (row.status === "succeeded") continue;
      if (row.status === "cancelled" || row.status === "failed") {
        needsRetry = true;
        continue;
      }

      if (row.provider !== "yookassa" || row.currency !== "RUB") {
        return errorResponse("Неподдерживаемый способ возврата.", 409);
      }

      const providerRefund = row.provider_refund_id
        ? await getYooKassaRefund(row.provider_refund_id)
        : await createYooKassaRefund({
            paymentId: row.provider_payment_id,
            amountRub: row.amount_rub,
            idempotencyKey: row.idempotency_key,
          });

      const result = await synchronizeRefund(providerRefund, row);

      if (result === "completed") {
        completed = true;
      } else if (result === "pending") {
        hasPending = true;
      } else if (result === "retry_required") {
        needsRetry = true;
      } else if (result === "manual_resolution_required") {
        manualResolutionRequired = true;
      } else if (
        result !== "refund_recorded" &&
        result !== "already_completed"
      ) {
        throw new Error("Не удалось завершить возврат.");
      }
    }

    if (completed) {
      return NextResponse.json(
        { success: true, state: "completed" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (manualResolutionRequired) {
      return errorResponse(
        "Возврат подтверждён, но целевой слот больше нельзя применить автоматически. Операция передана на ручную сверку; не создавайте повторный перенос.",
        409,
      );
    }

    return NextResponse.json(
      {
        success: true,
        state: "processing",
        message: hasPending
          ? "YooKassa ещё обрабатывает возврат. Исходное бронирование пока не изменено."
          : needsRetry
            ? "Возврат требует повторной проверки. Повторите запрос позднее."
            : "Возврат обрабатывается. Проверьте состояние позднее.",
      },
      {
        status: 202,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("[booking-transfer-refund] processing failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    return errorResponse(
      "Не удалось подтвердить возврат. Исходное бронирование не переключено. Повторите проверку позже.",
      503,
    );
  }
}
