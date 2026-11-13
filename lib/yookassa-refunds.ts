
const API_URL = "https://api.yookassa.ru/v3";

export type YooKassaRefund = {
  id?: unknown;
  payment_id?: unknown;
  status?: unknown;
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
