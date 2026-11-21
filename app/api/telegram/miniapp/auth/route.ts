
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  consumeApiRateLimit,
  getRateLimitClientIp,
} from "@/lib/api-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_INIT_DATA_AGE_SECONDS = 5 * 60;
const FUTURE_CLOCK_SKEW_SECONDS = 30;

type SupabaseConfig = {
  url: string;
  key: string;
};

type InitDataResult =
  | { ok: true; telegramUserId: number }
  | { ok: false; reason: "invalid" | "expired" };

function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;

  return url && key ? { url, key } : null;
}

function privateJson(
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
): NextResponse {
  const response = NextResponse.json(body, {
    status,
    headers,
  });

  response.headers.set("Cache-Control", "no-store");

  return response;
}

function rateLimitResponse(
  retryAfterSeconds: number,
): NextResponse {
  return privateJson(
    {
      error: "Слишком много запросов. Подождите и повторите попытку.",
    },
    429,
    {
      "Retry-After": String(
        Math.max(1, retryAfterSeconds),
      ),
    },
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value),
  );
}

/**
 * Проверяет подпись Telegram Mini App initData.
 *
 * Клиентские поля user.id и username отдельно
 * не принимаются: идентификатор извлекается
 * исключительно из проверенных подписанных данных.
 */
function verifyTelegramInitData(
  rawInitData: string,
  botToken: string,
): InitDataResult {
  if (
    !rawInitData ||
    rawInitData.length > MAX_BODY_BYTES
  ) {
    return { ok: false, reason: "invalid" };
  }

  const params = new URLSearchParams(rawInitData);
  const values = new Map<string, string>();

  for (const [key, value] of params.entries()) {
    // Дубликаты параметров запрещены:
    // иначе разные части системы могут трактовать
    // один initData по-разному.
    if (values.has(key)) {
      return { ok: false, reason: "invalid" };
    }

    values.set(key, value);
  }

  const receivedHash = values.get("hash");

  if (
    !receivedHash ||
    !/^[a-f0-9]{64}$/i.test(receivedHash)
  ) {
    return { ok: false, reason: "invalid" };
  }

  const authDateText = values.get("auth_date");

  if (
    !authDateText ||
    !/^\d+$/.test(authDateText)
  ) {
    return { ok: false, reason: "invalid" };
  }

  const authDate = Number(authDateText);

  if (!Number.isSafeInteger(authDate)) {
    return { ok: false, reason: "invalid" };
  }

  const now = Math.floor(Date.now() / 1000);

  if (
    authDate > now + FUTURE_CLOCK_SKEW_SECONDS ||
    now - authDate > MAX_INIT_DATA_AGE_SECONDS
  ) {
    return { ok: false, reason: "expired" };
  }

  const dataCheckString = Array.from(values.entries())
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  // Telegram:
  // secret_key = HMAC_SHA256(key="WebAppData", data=bot_token)
  const secretKey = createHmac(
    "sha256",
    "WebAppData",
  )
    .update(botToken)
    .digest();

  // calculated_hash = HMAC_SHA256(data_check_string, secret_key)
  const calculatedHash = createHmac(
    "sha256",
    secretKey,
  )
    .update(dataCheckString)
    .digest();

  const providedHash = Buffer.from(
    receivedHash,
    "hex",
  );

  if (
    calculatedHash.length !== providedHash.length ||
    !timingSafeEqual(calculatedHash, providedHash)
  ) {
    return { ok: false, reason: "invalid" };
  }

  // Только после проверки подписи разбираем user.
  const userText = values.get("user");

  if (!userText) {
    return { ok: false, reason: "invalid" };
  }

  let telegramUser: unknown;

  try {
    telegramUser = JSON.parse(userText);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (!isRecord(telegramUser)) {
    return { ok: false, reason: "invalid" };
  }

  const telegramUserId = telegramUser.id;

  if (
    typeof telegramUserId !== "number" ||
    !Number.isSafeInteger(telegramUserId) ||
    telegramUserId <= 0
  ) {
    return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    telegramUserId,
  };
}

export async function POST(request: NextRequest) {
  // Mini App обращается к API на том же домене.
  // Не разрешаем запросы с чужого origin.
  const origin = request.headers.get("origin");

  if (
    !origin ||
    origin !== request.nextUrl.origin
  ) {
    return privateJson(
      { error: "Недопустимый источник запроса." },
      403,
    );
  }

  const config = getSupabaseConfig();
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!config || !botToken) {
    console.error(
      "Telegram Mini App auth environment is incomplete.",
    );

    return privateJson(
      { error: "Сервис авторизации временно недоступен." },
      503,
    );
  }

  // Ограничиваем размер тела до разбора JSON.
  const contentLength = Number(
    request.headers.get("content-length") ?? "0",
  );

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_BODY_BYTES
  ) {
    return privateJson(
      { error: "Слишком большой запрос." },
      413,
    );
  }

  const clientIp = getRateLimitClientIp(request);

  if (!clientIp) {
    return privateJson(
      { error: "Не удалось определить источник запроса." },
      503,
    );
  }

  try {
    // Первое ограничение: IP.
    // Используем существующий route key telegram_link,
    // но отдельный префикс субъекта.
    const ipLimit = await consumeApiRateLimit({
      supabaseUrl: config.url,
      serviceKey: config.key,
      routeKey: "telegram_link",
      subject: `miniapp-auth:ip:${clientIp}`,
    });

    if (!ipLimit.allowed) {
      return rateLimitResponse(
        ipLimit.retryAfterSeconds,
      );
    }

    let rawBody: string;

    try {
      rawBody = await request.text();
    } catch {
      return privateJson(
        { error: "Некорректный запрос." },
        400,
      );
    }

    if (
      Buffer.byteLength(rawBody, "utf8") >
      MAX_BODY_BYTES
    ) {
      return privateJson(
        { error: "Слишком большой запрос." },
        413,
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return privateJson(
        { error: "Некорректный формат запроса." },
        400,
      );
    }

    if (
      !isRecord(body) ||
      typeof body.initData !== "string"
    ) {
      return privateJson(
        { error: "Не переданы данные Telegram." },
        400,
      );
    }

    const verified = verifyTelegramInitData(
      body.initData,
      botToken,
    );

    if (!verified.ok) {
      if (verified.reason === "expired") {
        return privateJson(
          {
            error:
              "Данные Telegram устарели. Закройте Mini App и откройте его заново.",
          },
          401,
        );
      }

      return privateJson(
        { error: "Не удалось подтвердить данные Telegram." },
        401,
      );
    }

    const telegramUserId = verified.telegramUserId;

    // Второе ограничение: Telegram ID.
    // Выполняется только после проверки подписи.
    const userLimit = await consumeApiRateLimit({
      supabaseUrl: config.url,
      serviceKey: config.key,
      routeKey: "telegram_link",
      subject: `miniapp-auth:user:${telegramUserId}`,
    });

    if (!userLimit.allowed) {
      return rateLimitResponse(
        userLimit.retryAfterSeconds,
      );
    }

    // Создаём случайный стандартный токен PongLab.
    // В Supabase отправляем исключительно его SHA-256.
    const sessionToken = randomBytes(32).toString("hex");

    const sessionTokenHash = createHash("sha256")
      .update(sessionToken)
      .digest("hex");

    const rpcResponse = await fetch(
      `${config.url}/rest/v1/rpc/create_telegram_miniapp_session`,
      {
        method: "POST",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_telegram_user_id: telegramUserId,
          p_session_token_hash: sessionTokenHash,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!rpcResponse.ok) {
      let rpcError: unknown = null;

      try {
        rpcError = await rpcResponse.json();
      } catch {
        // Не используем тело ошибки в ответе клиенту.
      }

      const errorCode =
        isRecord(rpcError) &&
        typeof rpcError.code === "string"
          ? rpcError.code
          : null;

      const errorMessage =
        isRecord(rpcError) &&
        typeof rpcError.message === "string"
          ? rpcError.message
          : null;

      // Функция сообщает об отсутствии активной
      // привязки через PostgreSQL P0001.
      if (
        errorCode === "P0001" &&
        errorMessage === "Active Telegram account not found"
      ) {
        return privateJson(
          {
            authenticated: false,
            linked: false,
            error:
              "Telegram не привязан к аккаунту PongLab. Сначала войдите на сайте и выполните привязку.",
          },
          403,
        );
      }

      console.error(
        "Telegram Mini App session RPC failed:",
        rpcResponse.status,
        errorCode ?? "unknown",
      );

      return privateJson(
        { error: "Не удалось создать сессию." },
        503,
      );
    }

    const rpcResult: unknown = await rpcResponse.json();

    const sessionRow = Array.isArray(rpcResult)
      ? rpcResult[0]
      : null;

    if (
      !isRecord(sessionRow) ||
      typeof sessionRow.user_id !== "string" ||
      typeof sessionRow.session_expires_at !== "string"
    ) {
      console.error(
        "Telegram Mini App session RPC returned invalid data.",
      );

      return privateJson(
        { error: "Не удалось завершить авторизацию." },
        503,
      );
    }

    const sessionExpiresAt = new Date(
      sessionRow.session_expires_at,
    );

    if (
      Number.isNaN(sessionExpiresAt.getTime()) ||
      sessionExpiresAt.getTime() <= Date.now()
    ) {
      console.error(
        "Telegram Mini App session expiry is invalid.",
      );

      return privateJson(
        { error: "Не удалось завершить авторизацию." },
        503,
      );
    }

    const response = privateJson({
      authenticated: true,
    });

    // Та же cookie, которую использует обычный сайт PongLab.
    response.cookies.set(
      "ponglab_session",
      sessionToken,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: sessionExpiresAt,
      },
    );

    return response;
  } catch (error) {
    console.error(
      "Telegram Mini App authentication failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return privateJson(
      { error: "Временная ошибка авторизации." },
      503,
    );
  }
}
