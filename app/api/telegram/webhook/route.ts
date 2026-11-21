
import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { consumeApiRateLimit } from "@/lib/api-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupabaseConfig = {
  url: string;
  key: string;
};

type TelegramMessage = {
  text?: unknown;
  chat?: {
    id?: unknown;
    type?: unknown;
  };
  from?: {
    id?: unknown;
    is_bot?: unknown;
    username?: unknown;
    first_name?: unknown;
  };
};

type TelegramUpdate = {
  update_id?: unknown;
  message?: TelegramMessage;
};

function getConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;

  return url && key ? { url, key } : null;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function verifyWebhookSecret(request: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = request.headers.get(
    "x-telegram-bot-api-secret-token",
  );

  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value),
  );
}

function getStartCode(message: TelegramMessage | undefined): {
  code: string | null;
  telegramUserId: number | null;
  chatId: number | null;
  username: string | null;
  firstName: string | null;
} {
  const empty = {
    code: null,
    telegramUserId: null,
    chatId: null,
    username: null,
    firstName: null,
  };

  if (!message || typeof message.text !== "string") {
    return empty;
  }

  if (!isRecord(message.chat) || !isRecord(message.from)) {
    return empty;
  }

  const chat = message.chat;
  const from = message.from;

  if (
    chat.type !== "private" ||
    from.is_bot === true
  ) {
    return empty;
  }

  const telegramUserId = from.id;
  const chatId = chat.id;

  if (
    typeof telegramUserId !== "number" ||
    !Number.isSafeInteger(telegramUserId) ||
    telegramUserId <= 0 ||
    typeof chatId !== "number" ||
    !Number.isSafeInteger(chatId) ||
    chatId <= 0
  ) {
    return empty;
  }

  const match = message.text.match(
    /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]{20,64}))?\s*$/i,
  );

  if (!match || !match[1]) {
    return empty;
  }

  return {
    code: match[1],
    telegramUserId,
    chatId,
    username:
      typeof from.username === "string"
        ? from.username.slice(0, 64)
        : null,
    firstName:
      typeof from.first_name === "string"
        ? from.first_name.slice(0, 128)
        : null,
  };
}

export async function POST(request: NextRequest) {
  if (!verifyWebhookSecret(request)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const config = getConfig();

  if (!config) {
    return json(
      { error: "Service temporarily unavailable" },
      503,
    );
  }

  try {
    const rawBody = await request.text();

    if (Buffer.byteLength(rawBody, "utf8") > 64 * 1024) {
      return json({ error: "Payload too large" }, 413);
    }

    let update: TelegramUpdate;

    try {
      const parsed: unknown = JSON.parse(rawBody);

      if (!isRecord(parsed)) {
        return json({ error: "Invalid payload" }, 400);
      }

      update = parsed as TelegramUpdate;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const updateId = update.update_id;

    if (
      typeof updateId !== "number" ||
      !Number.isSafeInteger(updateId) ||
      updateId < 0
    ) {
      return json({ error: "Invalid update ID" }, 400);
    }

    const limit = await consumeApiRateLimit({
      supabaseUrl: config.url,
      serviceKey: config.key,
      routeKey: "telegram_webhook",
      subject: "telegram-webhook-global",
    });

    if (!limit.allowed) {
      return json(
        { error: "Rate limit exceeded" },
        429,
      );
    }

    const link = getStartCode(update.message);

    const codeHash = link.code
      ? createHash("sha256")
          .update(link.code)
          .digest("hex")
      : null;

    const response = await fetch(
      `${config.url}/rest/v1/rpc/process_telegram_link_update`,
      {
        method: "POST",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_update_id: updateId,
          p_payload: update,
          p_code_hash: codeHash,
          p_telegram_user_id: link.telegramUserId,
          p_chat_id: link.chatId,
          p_username: link.username,
          p_first_name: link.firstName,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      console.error(
        "Telegram update processing RPC failed:",
        response.status,
      );

      return json(
        { error: "Update processing failed" },
        503,
      );
    }

    const result: unknown = await response.json();

    return json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error(
      "Telegram webhook failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return json(
      { error: "Webhook processing failed" },
      503,
    );
  }
}
