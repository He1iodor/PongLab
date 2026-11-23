
import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { consumeApiRateLimit } from "@/lib/api-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupabaseConfig = {
  url: string;
  key: string;
};

type MaxUser = {
  user_id?: unknown;
  username?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  is_bot?: unknown;
};

type MaxUpdate = {
  update_type?: unknown;
  timestamp?: unknown;
  chat_id?: unknown;
  user?: MaxUser;
  payload?: unknown;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function verifyWebhookSecret(request: NextRequest): boolean {
  const expected = process.env.MAX_WEBHOOK_SECRET;
  const provided = request.headers.get("x-max-bot-api-secret");

  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function positiveSafeInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

function optionalName(value: unknown): string | null {
  return typeof value === "string" ? value.trim().slice(0, 128) || null : null;
}

export async function POST(request: NextRequest) {
  if (!verifyWebhookSecret(request)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const config = getConfig();
  if (!config) {
    return json({ error: "Service temporarily unavailable" }, 503);
  }

  try {
    const rawBody = await request.text();

    if (Buffer.byteLength(rawBody, "utf8") > 64 * 1024) {
      return json({ error: "Payload too large" }, 413);
    }

    let update: MaxUpdate;
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (!isRecord(parsed)) return json({ error: "Invalid payload" }, 400);
      update = parsed as MaxUpdate;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    if (
      typeof update.update_type !== "string" ||
      update.update_type.length < 1 ||
      update.update_type.length > 64
    ) {
      return json({ error: "Invalid update type" }, 400);
    }

    if (
      update.timestamp !== undefined &&
      (typeof update.timestamp !== "number" ||
        !Number.isSafeInteger(update.timestamp) ||
        update.timestamp < 0)
    ) {
      return json({ error: "Invalid timestamp" }, 400);
    }

    const limit = await consumeApiRateLimit({
      supabaseUrl: config.url,
      serviceKey: config.key,
      routeKey: "max_webhook",
      subject: "max-webhook-global",
    });

    if (!limit.allowed) {
      return json({ error: "Rate limit exceeded" }, 429);
    }

    const user = isRecord(update.user) ? update.user as MaxUser : undefined;
    const maxUserId = positiveSafeInteger(user?.user_id);
    const chatId = positiveSafeInteger(update.chat_id);

    if (
      (update.update_type === "bot_started" ||
        update.update_type === "bot_stopped") &&
      maxUserId === null
    ) {
      return json({ error: "Invalid MAX user ID" }, 400);
    }

    if (update.update_type === "bot_started" && chatId === null) {
      return json({ error: "Invalid MAX chat ID" }, 400);
    }

    if (user?.is_bot === true) {
      return json({ error: "Bot users are not supported" }, 400);
    }

    const payloadText =
      typeof update.payload === "string" ? update.payload : "";
    const codeHash = payloadText.length > 0
      ? createHash("sha256").update(payloadText).digest("hex")
      : null;

    const eventKey = createHash("sha256")
      .update(rawBody, "utf8")
      .digest("hex");

    const response = await fetch(
      `${config.url}/rest/v1/rpc/process_max_update`,
      {
        method: "POST",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_event_key: eventKey,
          p_update_type: update.update_type,
          p_payload: update,
          p_code_hash: codeHash,
          p_max_user_id: maxUserId,
          p_chat_id: chatId,
          p_username: optionalName(user?.username),
          p_first_name: optionalName(user?.first_name),
          p_last_name: optionalName(user?.last_name),
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      console.error("MAX update processing RPC failed:", response.status);
      return json({ error: "Update processing failed" }, 503);
    }

    const result: unknown = await response.json();
    return json({ ok: true, result });
  } catch (error) {
    console.error(
      "MAX webhook failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return json({ error: "Webhook processing failed" }, 503);
  }
}
