```typescript
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

type VerifiedInitData =
  | { ok: true; maxUserId: number }
  | { ok: false; reason: "invalid" | "expired" };

function getConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;

  return url && key ? { url, key } : null;
}

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value),
  );
}

/**
 * Проверяет подписанные launch-параметры MAX.
 * ID пользователя извлекается только после проверки HMAC.
 */
function verifyMaxInitData(
  rawInitData: string,
  botToken: string,
): VerifiedInitData {
  if (!rawInitData || rawInitData.length > MAX_BODY_BYTES) {
    return { ok: false, reason: "invalid" };
  }

  const values = new Map<string, string>();

  for (const [key, value] of new URLSearchParams(rawInitData).entries()) {
    if (values.has(key)) {
      return { ok: false, reason: "invalid" };
    }

    values.set(key, value);
  }

  const receivedHash = values.get("hash");
  const authDateText = values.get("auth_date");

  if (
    !receivedHash ||
    !/^[a-f0-9]{64}$/i.test(receivedHash) ||
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
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  // MAX:
  // secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest();

  const providedHash = Buffer.from(receivedHash, "hex");

  if (
    calculatedHash.length !== providedHash.length ||
    !timingSafeEqual(calculatedHash, providedHash)
  ) {
    return { ok: false, reason: "invalid" };
  }

  // Данные пользователя читаются только после проверки подписи.
  let user: unknown;

  try {
    const userText = values.get("user");

    if (!userText) {
      return { ok: false, reason: "invalid" };
    }

    user = JSON.parse(userText);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (!isRecord(user)) {
    return { ok: false, reason: "invalid" };
  }

  const maxUserId = user.user_id;

  if (
    typeof maxUserId !== "number" ||
    !Number.isSafeInteger(maxUserId) ||
    maxUserId <= 0
  ) {
    return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    maxUserId,
  };
}

function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: "Слишком много запросов. Подождите и повторите попытку.",
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(Math.max(1, retryAfterSeconds)),
      },
    },
  );
}

function getRpcError(error: unknown) {
  if (!isRecord(error)) {
    return { code: null, message: null };
  }

  return {
    code: typeof error.code === "string" ? error.code : null,
    message: typeof error.message === "string" ? error.message : null,
  };
}

export async function POST(request: NextRequest) {
  // Разрешаем запросы только с того же домена.
  const origin = request.headers.get("origin");

  if (!origin || origin !== request.nextUrl.origin) {
    return privateJson(
      { error: "Недопустимый источник запроса." },
      403,
    );
  }

  const config = getConfig();
  const botToken = process.env.MAX_BOT_TOKEN?.trim();

  if (!config || !botToken) {
    console.error("MAX Mini App auth environment is incomplete.");

    return privateJson(
      { error: "Сервис авторизации временно недоступен." },
      503,
    );
  }

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
    // Ограничение запросов по IP.
    const ipLimit = await consumeApiRateLimit({
      supabaseUrl: config.url,
      serviceKey: config.key,
      routeKey: "max_link",
      subject: `miniapp-auth:ip:${clientIp}`,
    });

    if (!ipLimit.allowed) {
      return rateLimitResponse(ipLimit.retryAfterSeconds);
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

    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
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

    if (!isRecord(body) || typeof body.initData !== "string") {
      return privateJson(
        { error: "Не переданы данные MAX." },
        400,
      );
    }

    const verified = verifyMaxInitData(
      body.initData,
      botToken,
    );

    if (!verified.ok) {
      return privateJson(
        {
          error:
            verified.reason === "expired"
              ? "Данные MAX устарели. Закройте Mini App и откройте его заново."
              : "Не удалось подтвердить данные MAX.",
        },
        401,
      );
    }

    const maxUserId = verified.maxUserId;

    // Ограничение запросов по подтверждённому MAX ID.
    const userLimit = await consumeApiRateLimit({
      supabaseUrl: config.url,
      serviceKey: config.key,
      routeKey: "max_link",
      subject: `miniapp-auth:user:${maxUserId}`,
    });

    if (!userLimit.allowed) {
      return rateLimitResponse(userLimit.retryAfterSeconds);
    }

    // Создаём стандартную сессию PongLab.
    // В Supabase передаём только SHA-256 токена.
    const sessionToken = randomBytes(32).toString("hex");

    const sessionTokenHash = createHash("sha256")
      .update(sessionToken)
      .digest("hex");

    const rpcResponse = await fetch(
      `${config.url}/rest/v1/rpc/create_max_miniapp_session`,
      {
        method: "POST",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_max_user_id: maxUserId,
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
        // Не передаём внутреннюю ошибку базы клиенту.
      }

      const error = getRpcError(rpcError);

      if (
        error.code === "P0001" &&
        error.message === "Active MAX account not found"
      ) {
        return privateJson(
          {
            authenticated: false,
            linked: false,
            error:
              "MAX не привязан к аккаунту PongLab. Сначала войдите на сайте и выполните привязку MAX.",
          },
          403,
        );
      }

      console.error(
        "MAX Mini App session RPC failed:",
        rpcResponse.status,
        error.code ?? "unknown",
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
        "MAX Mini App session RPC returned invalid data.",
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
        "MAX Mini App session expiry is invalid.",
      );

      return privateJson(
        { error: "Не удалось завершить авторизацию." },
        503,
      );
    }

    const response = privateJson({
      authenticated: true,
      linked: true,
    });

    // Используем ту же cookie, что и обычный сайт PongLab.
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
      "MAX Mini App authentication failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return privateJson(
      { error: "Временная ошибка авторизации." },
      503,
    );
  }
}
```
