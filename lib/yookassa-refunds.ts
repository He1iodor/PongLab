
const API_URL = "https://api.yookassa.ru/v3";

export type YooKassaRefund = {
  id?: unknown;
  payment_id?: unknown;
  status?: unknown;
  created_at?: unknown;
  amount?: {
    value?: unknown;
    currency?: unknown;
  };
};

function authorization(): string {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secret = process.env.YOOKASSA_SECRET_KEY?.trim();

  if (!shopId || !secret) {
    throw new Error("YooKassa credentials are not configured.");
  }

  return `Basic ${Buffer.from(`${shopId}:${secret}`, "utf8").toString("base64")}`;
}

async function parseResponse(response: Response): Promise<YooKassaRefund> {
  if (!response.ok) {
    console.error("[yookassa-refund] provider request failed", {
      status: response.status,
    });
    throw new Error("Не удалось получить подтверждение YooKassa.");
  }

  const result: unknown = await response.json();

  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Некорректный ответ YooKassa.");
  }

  return result as YooKassaRefund;
}

async function parseRefundListResponse(
  response: Response,
): Promise<{
  items: YooKassaRefund[];
  nextCursor: string | null;
}> {
  if (!response.ok) {
    console.error("[yookassa-refund] provider list request failed", {
      status: response.status,
    });
    throw new Error("Не удалось сверить возвраты YooKassa.");
  }

  const result: unknown = await response.json();

  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result)
  ) {
    throw new Error("Некорректный список возвратов YooKassa.");
  }

  const data = result as Record<string, unknown>;

  if (data.type !== "list" || !Array.isArray(data.items)) {
    throw new Error("Некорректная структура списка возвратов YooKassa.");
  }

  if (
    data.next_cursor !== undefined &&
    data.next_cursor !== null &&
    typeof data.next_cursor !== "string"
  ) {
    throw new Error("Некорректный курсор списка возвратов YooKassa.");
  }

  const items: YooKassaRefund[] = [];

  for (const item of data.items) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      throw new Error("Некорректный объект возврата YooKassa.");
    }

    items.push(item as YooKassaRefund);
  }

  return {
    items,
    nextCursor:
      typeof data.next_cursor === "string"
        ? data.next_cursor
        : null,
  };
}

export async function createYooKassaRefund(args: {
  paymentId: string;
  amountRub: number;
  idempotencyKey: string;
}): Promise<YooKassaRefund> {
  if (
    !args.paymentId ||
    args.paymentId.length > 200 ||
    !Number.isSafeInteger(args.amountRub) ||
    args.amountRub < 1 ||
    !/^[0-9a-f-]{36}$/i.test(args.idempotencyKey)
  ) {
    throw new Error("Invalid refund parameters.");
  }

  const response = await fetch(`${API_URL}/refunds`, {
    method: "POST",
    headers: {
      Authorization: authorization(),
      "Idempotence-Key": args.idempotencyKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payment_id: args.paymentId,
      amount: {
        value: args.amountRub.toFixed(2),
        currency: "RUB",
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  return parseResponse(response);
}

export async function getYooKassaRefund(
  refundId: string,
): Promise<YooKassaRefund> {
  if (!refundId || refundId.length > 200) {
    throw new Error("Invalid YooKassa refund ID.");
  }

  const response = await fetch(
    `${API_URL}/refunds/${encodeURIComponent(refundId)}`,
    {
      method: "GET",
      headers: {
        Authorization: authorization(),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );

  return parseResponse(response);
}

/**
 * Получает все возвраты конкретного платежа.
 * Используется перед повторной отправкой POST /refunds,
 * чтобы обнаружить возврат, созданный YooKassa,
 * но не получивший подтверждение нашим сервером.
 */
export async function listYooKassaRefunds(
  paymentId: string,
): Promise<YooKassaRefund[]> {
  if (!paymentId || paymentId.length > 200) {
    throw new Error("Invalid YooKassa payment ID.");
  }

  const allItems: YooKassaRefund[] = [];
  let cursor: string | null = null;

  // Защита от бесконечной пагинации.
  // При превышении лимита прекращаем работу без POST.
  for (let page = 0; page < 20; page++) {
    const url = new URL(`${API_URL}/refunds`);

    url.searchParams.set("payment_id", paymentId);
    url.searchParams.set("limit", "100");

    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authorization(),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    const result = await parseRefundListResponse(response);

    for (const refund of result.items) {
      if (
        typeof refund.id !== "string" ||
        refund.id.length < 1 ||
        refund.id.length > 200 ||
        refund.payment_id !== paymentId
      ) {
        throw new Error(
          "YooKassa refund list contains an invalid refund.",
        );
      }

      allItems.push(refund);
    }

    if (!result.nextCursor) {
      return allItems;
    }

    if (result.nextCursor === cursor) {
      throw new Error(
        "YooKassa refund pagination cursor did not advance.",
      );
    }

    cursor = result.nextCursor;
  }

  throw new Error(
    "YooKassa refund list exceeded the safe pagination limit.",
  );
}
