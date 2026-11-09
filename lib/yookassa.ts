import { createHash } from "node:crypto";
import { isIP } from "node:net";

const YOOKASSA_API_URL = "https://api.yookassa.ru/v3";

export type PaymentSyncResult = {
  providerStatus: "pending" | "succeeded" | "canceled";
  databaseResult?: string;
  payment: YooKassaPayment;
};

type YooKassaAmount = {
  value?: unknown;
  currency?: unknown;
};

export type YooKassaPayment = {
  id?: unknown;
  status?: unknown;
  paid?: unknown;
  amount?: YooKassaAmount;
  metadata?: Record<string, unknown> | null;
  confirmation?: {
    type?: unknown;
    confirmation_url?: unknown;
  } | null;
  cancellation_details?: {
    reason?: unknown;
    party?: unknown;
  } | null;
};

export class YooKassaApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number) {
    super(`YooKassa API request failed (${statusCode}).`);
    this.name = "YooKassaApiError";
    this.statusCode = statusCode;
  }
}

type SupabaseConfig = {
  url: string;
  key: string;
};

function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function getYooKassaCredentials(): { shopId: string; secretKey: string } | null {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();
  return shopId && secretKey ? { shopId, secretKey } : null;
}

function getBasicAuthorization(): string {
  const credentials = getYooKassaCredentials();
  if (!credentials) {
    throw new Error("YooKassa credentials are not configured.");
  }

  return `Basic ${Buffer.from(
    `${credentials.shopId}:${credentials.secretKey}`,
    "utf8",
  ).toString("base64")}`;
}

export function getPublicAppUrl(): string {
  const configured = process.env.PONGLAB_APP_URL?.trim();
  if (!configured) {
    throw new Error("PONGLAB_APP_URL is not configured.");
  }

  const url = new URL(configured);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (process.env.NODE_ENV === "production" && url.protocol !== "https:")
  ) {
    throw new Error("PONGLAB_APP_URL must be a clean HTTPS origin in production.");
  }

  return url.origin;
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export function getSessionTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)ponglab_session=([a-f0-9]{64})(?:;|$)/i);
  return match?.[1] ?? null;
}

export async function resolveSessionUserId(sessionToken: string): Promise<string | null> {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase configuration is not available.");
  }

  const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
  const target = new URL(`${config.url}/rest/v1/user_sessions`);
  target.searchParams.set("select", "user_id");
  target.searchParams.set("token_hash", `eq.${tokenHash}`);
  target.searchParams.set("expires_at", `gt.${new Date().toISOString()}`);
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
    throw new Error(`Supabase session lookup failed (${response.status}).`);
  }

  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || typeof rows[0]?.user_id !== "string") {
    return null;
  }

  return rows[0].user_id;
}

export async function supabaseRpc<T = unknown>(
  functionName: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase configuration is not available.");
  }

  const response = await fetch(`${config.url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    console.error(`Supabase RPC ${functionName} failed. HTTP status:`, response.status);
    throw new Error(`Supabase RPC ${functionName} failed.`);
  }

  return (await response.json()) as T;
}

export function parseWholeRubleAmount(amount: YooKassaAmount | null | undefined): number | null {
  if (!amount || amount.currency !== "RUB" || typeof amount.value !== "string") {
    return null;
  }

  const match = amount.value.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;

  const rubles = Number(match[1]);
  const kopecks = Number((match[2] ?? "").padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(rubles) || !Number.isInteger(kopecks)) return null;
  if (kopecks !== 0) return null;

  return rubles;
}

export async function createYooKassaPayment(args: {
  idempotencyKey: string;
  amountRub: number;
  paymentGroupId: string;
  userId: string;
}): Promise<YooKassaPayment> {
  if (!isUuid(args.idempotencyKey) || !isUuid(args.paymentGroupId) || !isUuid(args.userId)) {
    throw new Error("Invalid internal payment identifiers.");
  }

  if (!Number.isSafeInteger(args.amountRub) || args.amountRub <= 0) {
    throw new Error("Invalid payment amount.");
  }

  const returnUrl = new URL("/payment/return", getPublicAppUrl());
  returnUrl.searchParams.set("payment_group_id", args.paymentGroupId);

  const response = await fetch(`${YOOKASSA_API_URL}/payments`, {
    method: "POST",
    headers: {
      Authorization: getBasicAuthorization(),
      "Idempotence-Key": args.idempotencyKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: {
        value: `${args.amountRub.toFixed(2)}`,
        currency: "RUB",
      },
      capture: true,
      confirmation: {
        type: "redirect",
        return_url: returnUrl.toString(),
      },
      description: `PongLab booking ${args.paymentGroupId}`,
      metadata: {
        payment_group_id: args.paymentGroupId,
        user_id: args.userId,
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    console.error("YooKassa create payment failed. HTTP status:", response.status);
    throw new YooKassaApiError(response.status);
  }

  const payment: unknown = await response.json();
  if (!payment || typeof payment !== "object") {
    throw new Error("YooKassa returned an invalid payment object.");
  }

  return payment as YooKassaPayment;
}

export async function getYooKassaPayment(paymentId: string): Promise<YooKassaPayment> {
  if (!paymentId || paymentId.length > 128) {
    throw new Error("Invalid YooKassa payment ID.");
  }

  const response = await fetch(
    `${YOOKASSA_API_URL}/payments/${encodeURIComponent(paymentId)}`,
    {
      method: "GET",
      headers: {
        Authorization: getBasicAuthorization(),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!response.ok) {
    console.error("YooKassa get payment failed. HTTP status:", response.status);
    throw new Error("Не удалось проверить статус платежа в YooKassa.");
  }

  const payment: unknown = await response.json();
  if (!payment || typeof payment !== "object") {
    throw new Error("YooKassa returned an invalid payment object.");
  }

  return payment as YooKassaPayment;
}

export async function syncYooKassaPayment(
  payment: YooKassaPayment,
  expectedPaymentGroupId?: string,
): Promise<PaymentSyncResult> {
  if (typeof payment.id !== "string" || typeof payment.status !== "string") {
    throw new Error("YooKassa payment object is missing required fields.");
  }

  const metadataGroupId = payment.metadata?.payment_group_id;
  if (!isUuid(metadataGroupId)) {
    throw new Error("YooKassa payment metadata has no valid payment group ID.");
  }

  if (expectedPaymentGroupId && metadataGroupId !== expectedPaymentGroupId) {
    throw new Error("YooKassa payment does not belong to the requested booking group.");
  }

  const amountRub = parseWholeRubleAmount(payment.amount);
  if (amountRub === null) {
    throw new Error("YooKassa payment amount or currency is invalid.");
  }

  if (payment.status === "succeeded") {
    if (payment.paid !== true) {
      throw new Error("YooKassa payment is succeeded but is not marked as paid.");
    }

    const databaseResult = await supabaseRpc<string>("apply_payment_group_success", {
      p_payment_group_id: metadataGroupId,
      p_provider_payment_id: payment.id,
      p_amount_rub: amountRub,
    });

    return {
      providerStatus: "succeeded",
      databaseResult,
      payment,
    };
  }

  if (payment.status === "canceled") {
    const reason =
      typeof payment.cancellation_details?.reason === "string"
        ? payment.cancellation_details.reason.slice(0, 80)
        : "yookassa_payment_canceled";

    const databaseResult = await supabaseRpc<string>("apply_payment_group_failure", {
      p_payment_group_id: metadataGroupId,
      p_final_status: "cancelled",
      p_provider_payment_id: payment.id,
      p_failure_reason: reason,
    });

    return {
      providerStatus: "canceled",
      databaseResult,
      payment,
    };
  }

  return {
    providerStatus: "pending",
    payment,
  };
}

function ipv4ToNumber(ip: string): number | null {
  if (isIP(ip) !== 4) return null;
  const parts = ip.split(".").map(Number);
  return parts.reduce((value, part) => ((value << 8) | part) >>> 0, 0);
}

function isInIpv4Range(ip: string, cidr: string): boolean {
  const [network, prefixText] = cidr.split("/");
  const ipNumber = ipv4ToNumber(ip);
  const networkNumber = ipv4ToNumber(network);
  const prefix = Number(prefixText);
  if (ipNumber === null || networkNumber === null || !Number.isInteger(prefix)) return false;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipNumber & mask) === (networkNumber & mask);
}

export function isYooKassaWebhookIp(ip: string | null): boolean {
  if (!ip || isIP(ip) === 0) return false;
  if (isIP(ip) === 6) {
    return ip.toLowerCase().startsWith("2a02:5180:");
  }

  const exact = new Set(["77.75.156.11", "77.75.156.35"]);
  if (exact.has(ip)) return true;

  return [
    "185.71.76.0/27",
    "185.71.77.0/27",
    "77.75.153.0/25",
    "77.75.154.128/25",
  ].some((range) => isInIpv4Range(ip, range));
}
