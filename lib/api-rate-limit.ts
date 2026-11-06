
import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";

export type ApiRateLimitRoute =
  | "availability"
  | "booking_hold";

type ApiRateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type ConsumeApiRateLimitParams = {
  supabaseUrl: string;
  serviceKey: string;
  routeKey: ApiRateLimitRoute;
  subject: string;
};

function getSubjectHash(subject: string): string {
  return createHash("sha256")
    .update(subject)
    .digest("hex");
}

/**
 * Возвращает IP, установленный инфраструктурой Vercel.
 * В локальной разработке используется отдельная общая корзина.
 */
export function getRateLimitClientIp(
  request: Request,
): string | null {
  const ip = request.headers.get("x-real-ip")?.trim();

  if (ip && isIP(ip)) {
    return ip;
  }

  if (process.env.NODE_ENV !== "production") {
    return "local-development";
  }

  return null;
}

/**
 * Создаёт токен для внутреннего вызова availability из booking hold.
 * Токен нельзя сформировать без серверного секрета.
 */
export function createInternalAvailabilityToken(
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update("ponglab:internal-availability:v1")
    .digest("hex");
}

/**
 * Проверяет, что запрос availability создан внутренним серверным кодом.
 */
export function isInternalAvailabilityRequest(
  request: Request,
  secret: string,
): boolean {
  const provided = request.headers.get(
    "x-ponglab-internal-availability",
  );

  if (
    !provided ||
    !/^[a-f0-9]{64}$/i.test(provided)
  ) {
    return false;
  }

  const expected = createInternalAvailabilityToken(secret);

  return timingSafeEqual(
    Buffer.from(provided, "hex"),
    Buffer.from(expected, "hex"),
  );
}

/**
 * Атомарно расходует лимит через PostgreSQL RPC.
 * В таблицу передаётся только SHA-256-хеш субъекта.
 */
export async function consumeApiRateLimit({
  supabaseUrl,
  serviceKey,
  routeKey,
  subject,
}: ConsumeApiRateLimitParams): Promise<ApiRateLimitResult> {
  if (!subject || !subject.trim()) {
    throw new Error("Rate limit subject is empty.");
  }

  const subjectHash = getSubjectHash(subject);

  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/consume_api_rate_limit`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_route_key: routeKey,
        p_subject_hash: subjectHash,
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const details = await response.text();

    console.error(
      "API rate limit RPC failed:",
      response.status,
      details,
    );

    throw new Error("Не удалось проверить лимит запросов.");
  }

  const data: unknown = await response.json();

  const row = Array.isArray(data) ? data[0] : data;

  if (
    !row ||
    typeof row !== "object" ||
    typeof (row as Record<string, unknown>).allowed !== "boolean"
  ) {
    throw new Error("Некорректный ответ rate limit RPC.");
  }

  const result = row as Record<string, unknown>;

  const remaining = Number(result.remaining);
  const retryAfterSeconds = Number(result.retry_after_seconds);

  if (
    !Number.isInteger(remaining) ||
    remaining < 0 ||
    !Number.isInteger(retryAfterSeconds) ||
    retryAfterSeconds < 0
  ) {
    throw new Error("Некорректные значения rate limit RPC.");
  }

  return {
    allowed: result.allowed as boolean,
    remaining,
    retryAfterSeconds,
  };
}
