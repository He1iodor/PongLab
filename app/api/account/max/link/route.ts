
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
import { getMaxBotInfo } from "@/lib/max/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupabaseConfig = {
  url: string;
  key: string;
};

type MaxAccountRow = {
  max_user_id: number | string | null;
  username: string | null;
  linked_at: string | null;
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
    headers: { "Cache-Control": "no-store" },
  });
}

function apiHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

async function getAuthenticatedUserId(request: NextRequest) {
  const sessionToken = getSessionTokenFromRequest(request);

  if (!sessionToken) return null;

  return resolveSessionUserId(sessionToken);
}

async function getMaxAccount(
  config: SupabaseConfig,
  userId: string,
): Promise<MaxAccountRow | null> {
  const target = new URL(`${config.url}/rest/v1/max_accounts`);

  target.searchParams.set(
    "select",
    "max_user_id,username,linked_at,unlinked_at",
  );
  target.searchParams.set("user_id", `eq.${userId}`);
  target.searchParams.set("limit", "1");

  const response = await fetch(target, {
    headers: apiHeaders(config.key),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    console.error("MAX account lookup failed:", response.status);
    throw new Error("Не удалось проверить привязку MAX.");
  }

  const rows: unknown = await response.json();

  if (!Array.isArray(rows)) {
    throw new Error("Некорректный ответ MAX account lookup.");
  }

  return (rows[0] as MaxAccountRow | undefined) ?? null;
}

function isLinked(account: MaxAccountRow | null): boolean {
  return Boolean(
    account &&
    account.max_user_id !== null &&
    account.unlinked_at === null,
  );
}

function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error:
        "Слишком много запросов на привязку MAX. Подождите немного и повторите попытку.",
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

function getValidBotUsername(username: string | null | undefined) {
  const value = username?.trim();

  if (
    !value ||
    value.length < 11 ||
    value.length > 60 ||
    !/^[a-z][a-z0-9_]*(?:_bot|bot)$/.test(value)
  ) {
    throw new Error("MAX API returned an invalid bot username.");
  }

  return value;
}

export async function GET(request: NextRequest) {
  const config = getConfig();

  if (!config) {
    return noStoreJson(
      { error: "Сервис временно недоступен." },
      503,
    );
  }

  try {
    const userId = await getAuthenticatedUserId(request);

    if (!userId) {
      return noStoreJson(
        {
          authenticated: false,
          error: "Войдите в личный кабинет.",
        },
        401,
      );
    }

    const account = await getMaxAccount(config, userId);
    const linked = isLinked(account);

    return noStoreJson({
      authenticated: true,
      linked,
      username: linked ? account?.username ?? null : null,
      linked_at: linked ? account?.linked_at ?? null : null,
    });
  } catch (error) {
    console.error(
      "MAX account status failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return noStoreJson(
      { error: "Не удалось проверить статус MAX." },
      503,
    );
  }
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

  try {
    const userId = await getAuthenticatedUserId(request);

    if (!userId) {
      return noStoreJson(
        {
          authenticated: false,
          error: "Сессия истекла. Войдите повторно.",
        },
        401,
      );
    }

    const userLimit = await consumeApiRateLimit({
      supabaseUrl: config.url,
      serviceKey: config.key,
      routeKey: "max_link",
      subject: `user:${userId}`,
    });

    if (!userLimit.allowed) {
      return rateLimitResponse(userLimit.retryAfterSeconds);
    }

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
      routeKey: "max_link",
      subject: `ip:${clientIp}`,
    });

    if (!ipLimit.allowed) {
      return rateLimitResponse(ipLimit.retryAfterSeconds);
    }

    const account = await getMaxAccount(config, userId);

    if (isLinked(account)) {
      return noStoreJson(
        {
          linked: true,
          error:
            "К этому аккаунту уже привязан MAX. Сначала отключите текущую привязку.",
        },
        409,
      );
    }

    const bot = await getMaxBotInfo();
    const botUsername = getValidBotUsername(bot.username);

    const code = randomBytes(32).toString("base64url");

    const codeHash = createHash("sha256")
      .update(code)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000,
    ).toISOString();

    const rpcResponse = await fetch(
      `${config.url}/rest/v1/rpc/create_max_link_code`,
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
        "MAX link code RPC failed:",
        rpcResponse.status,
      );

      return noStoreJson(
        { error: "Не удалось создать ссылку привязки MAX." },
        503,
      );
    }

    const deepLink =
      `https://max.ru/${botUsername}?start=${encodeURIComponent(code)}`;

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
      "MAX link creation failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return noStoreJson(
      { error: "Не удалось создать ссылку привязки MAX." },
      503,
    );
  }
}
