import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  consumeApiRateLimit,
  getRateLimitClientIp,
} from "@/lib/api-rate-limit";
import {
  getSessionTokenFromRequest,
  resolveSessionUserId,
} from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupabaseConfig = {
  url: string;
  key: string;
};

type TelegramAccountRow = {
  telegram_user_id: number | string | null;
  unlinked_at: string | null;
};

function getConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;

  return url && key ? { url, key } : null;
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function apiHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error:
        "Слишком много запросов на привязку Telegram. Подождите немного и повторите попытку.",
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": "5",
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

async function isTelegramAlreadyLinked(
  config: SupabaseConfig,
  userId: string,
): Promise<boolean> {
  const target = new URL(
    `${config.url}/rest/v1/telegram_accounts`,
  );

  target.searchParams.set(
    "select",
    "telegram_user_id,unlinked_at",
  );
  target.searchParams.set("user_id", `eq.${userId}`);
  target.searchParams.set("limit", "1");

  const response = await fetch(target, {
    headers: apiHeaders(config.key),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    console.error(
      "Telegram account lookup failed:",
      response.status,
    );

    throw new Error("Не удалось проверить привязку Telegram.");
  }

  const rows: unknown = await response.json();

  if (!Array.isArray(rows)) {
    throw new Error("Некорректный ответ Telegram account lookup.");
  }

  const account = rows[0] as TelegramAccountRow | undefined;

  return Boolean(
    account &&
    account.telegram_user_id !== null &&
    account.unlinked_at === null,
  );
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== request.nextUrl.origin) {
    return noStoreJson(
      { error: "Недопустимый запрос." },
      403,
    );
  }

  const config = getConfig();

  if (!config) {
    return noStoreJson(
      { error: "Сервис временно недоступен." },
      503,
    );
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME
    ?.trim()
    .replace(/^@/, "");

  if (
    !botUsername ||
    !/^[A-Za-z0-9_]{5,32}$/.test(botUsername)
  ) {
    console.error(
      "TELEGRAM_BOT_USERNAME is missing or invalid.",
    );

    return noStoreJson(
      { error: "Привязка Telegram пока не настроена." },
      503,
    );
  }

  try {
    // Пользователь определяется только по серверной сессии сайта.
    const sessionToken = getSessionTokenFromRequest(request);

    if (!sessionToken) {
      return noStoreJson(
        {
          authenticated: false,
          error: "Войдите в личный кабинет.",
        },
        401,
      );
    }

    const userId = await resolveSessionUserId(sessionToken);

    if (!userId) {
      return noStoreJson(
        {
          authenticated: false,
          error: "Сессия истекла. Войдите повторно.",
        },
        401,
      );
    }

    // Ограничение по аккаунту.
    const userLimit = await consumeApiRateLimit({
      supabaseUrl: config.url,
      serviceKey: config.key,
      routeKey: "telegram_link",
      subject: `user:${userId}`,
    });

    if (!userLimit.allowed) {
      return rateLimitResponse(userLimit.retryAfterSeconds);
    }

    // Дополнительное ограничение по IP.
    const clientIp = getRateLimitClientIp(request);

    if (!clientIp) {
      return noStoreJson(
        { error: "Не удалось определить источник запроса." },
        503,
      );
    }

    const ipLimit = await consumeApiRateLimit({
      supabaseUrl: config.url,
      serviceKey: config.key,
      routeKey: "telegram_link",
      subject: `ip:${clientIp}`,
    });

    if (!ipLimit.allowed) {
      return rateLimitResponse(ipLimit.retryAfterSeconds);
    }

    // Проверяем, не подключён ли Telegram уже к этому аккаунту.
    if (await isTelegramAlreadyLinked(config, userId)) {
      return noStoreJson(
        {
          linked: true,
          error:
            "К этому аккаунту уже привязан Telegram. Сначала отключите текущую привязку.",
        },
        409,
      );
    }

    // 24 случайных байта дают 32 символа base64url.
    // Такой параметр подходит для Telegram deep link.
    const code = randomBytes(24).toString("base64url");

    const codeHash = createHash("sha256")
      .update(code)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000,
    ).toISOString();

    // Код сохраняется только в виде хеша.
    // SQL-функция атомарно отзывает предыдущие коды пользователя.
    const rpcResponse = await fetch(
      `${config.url}/rest/v1/rpc/create_telegram_link_code`,
      {
        method: "POST",
        headers: {
          ...apiHeaders(config.key),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_user_id: userId,
          p_code_hash: codeHash,
          p_expires_at: expiresAt,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!rpcResponse.ok) {
      console.error(
        "Telegram link code RPC failed:",
        rpcResponse.status,
      );

      return noStoreJson(
        { error: "Не удалось создать ссылку привязки Telegram." },
        503,
      );
    }

    const deepLink =
      `https://t.me/${botUsername}?start=${encodeURIComponent(code)}`;

    return noStoreJson(
      {
        linked: false,
        deep_link: deepLink,
        expires_at: expiresAt,
      },
      201,
    );
  } catch (error) {
    console.error(
      "Telegram link creation failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return noStoreJson(
      { error: "Не удалось создать ссылку привязки Telegram." },
      503,
    );
  }
}
