import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 20;
const MAX_BODY_BYTES = 4 * 1024;
const SUPABASE_TIMEOUT_MS = 2_000;
const TELEGRAM_TIMEOUT_MS = 2_500;

type SupabaseConfig = { url: string; key: string };
type ClaimedMessage = {
  id: unknown;
  recipient_chat_id: unknown;
  payload: unknown;
  lock_token: unknown;
};
type CompletionStatus = "sent" | "pending" | "dead";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function verifyWorkerSecret(request: NextRequest): boolean {
  const expected = process.env.TELEGRAM_MESSAGING_WORKER_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected || !authorization?.startsWith("Bearer ")) return false;

  const provided = authorization.slice("Bearer ".length);
  if (!provided) return false;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  return expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function getChatId(value: unknown): string | number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value !== 0) {
    return value;
  }
  if (typeof value === "string" && /^-?\d{1,20}$/.test(value) && value !== "0") {
    return value;
  }
  throw new Error("Invalid Telegram recipient chat ID.");
}

function buildTelegramMessage(
  chatId: string | number,
  payload: unknown,
): Record<string, unknown> {
  if (!isRecord(payload)) throw new Error("Message payload must be a JSON object.");
  if (typeof payload.text !== "string" || !payload.text.trim() || payload.text.length > 4096) {
    throw new Error("Message text is missing or exceeds 4096 characters.");
  }

  const message: Record<string, unknown> = { chat_id: chatId, text: payload.text };
  const booleanOptions = [
    "disable_web_page_preview",
    "disable_notification",
    "protect_content",
  ] as const;

  for (const key of booleanOptions) {
    if (typeof payload[key] === "boolean") message[key] = payload[key];
  }

  if (
    typeof payload.parse_mode === "string" &&
    (["HTML", "Markdown", "MarkdownV2"] as string[]).includes(payload.parse_mode)
  ) {
    message.parse_mode = payload.parse_mode;
  }

  if (isRecord(payload.reply_markup)) message.reply_markup = payload.reply_markup;
  if (isRecord(payload.link_preview_options)) {
    message.link_preview_options = payload.link_preview_options;
  }
  if (
    typeof payload.message_thread_id === "number" &&
    Number.isSafeInteger(payload.message_thread_id) &&
    payload.message_thread_id > 0
  ) {
    message.message_thread_id = payload.message_thread_id;
  }

  return message;
}

async function callSupabaseRpc<T>(
  config: SupabaseConfig,
  functionName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${config.url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
    signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`${functionName} RPC failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as T;
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string | number,
  payload: unknown,
): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildTelegramMessage(chatId, payload)),
      cache: "no-store",
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    },
  );

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Telegram returned invalid JSON (HTTP ${response.status}).`);
  }

  if (!response.ok || !isRecord(result) || result.ok !== true) {
    const description = isRecord(result) && typeof result.description === "string"
      ? result.description.slice(0, 350)
      : `HTTP ${response.status}`;
    const code = isRecord(result) && typeof result.error_code === "number"
      ? result.error_code
      : response.status;
    throw new Error(`Telegram API error ${code}: ${description}`);
  }
}

async function completeMessage(
  config: SupabaseConfig,
  id: string,
  lockToken: string,
  success: boolean,
  error: string | null,
): Promise<CompletionStatus> {
  const result = await callSupabaseRpc<unknown>(config, "complete_messaging_outbox", {
    p_id: id,
    p_lock_token: lockToken,
    p_success: success,
    p_error: error,
  });
  const status = Array.isArray(result) ? result[0] : result;
  if (status !== "sent" && status !== "pending" && status !== "dead") {
    throw new Error("Outbox completion returned an unexpected status; the lock may be stale.");
  }
  return status;
}

async function processMessage(
  config: SupabaseConfig,
  botToken: string,
  message: ClaimedMessage,
) {
  if (!isUuid(message.id) || !isUuid(message.lock_token)) {
    return { sent: false, retried: false, dead: false, error: "Invalid message ID or lock token." };
  }

  let deliveryError: string | null = null;
  try {
    await sendTelegramMessage(
      botToken,
      getChatId(message.recipient_chat_id),
      message.payload,
    );
  } catch (error) {
    deliveryError = error instanceof Error
      ? error.message.slice(0, 500)
      : "Unknown Telegram delivery error.";
  }

  const status = await completeMessage(
    config,
    message.id,
    message.lock_token,
    deliveryError === null,
    deliveryError,
  );

  if (deliveryError === null && status === "sent") {
    return { sent: true, retried: false, dead: false, error: null };
  }
  if (deliveryError !== null && status === "pending") {
    return { sent: false, retried: true, dead: false, error: deliveryError };
  }
  if (deliveryError !== null && status === "dead") {
    return { sent: false, retried: false, dead: true, error: deliveryError };
  }
  throw new Error("Telegram delivery and outbox completion returned inconsistent results.");
}

export async function POST(request: NextRequest) {
  if (!verifyWorkerSecret(request)) return json({ error: "Unauthorized" }, 401);

  const config = getSupabaseConfig();
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!config || !botToken) {
    console.error("Telegram messaging worker environment is incomplete.");
    return json({ error: "Service temporarily unavailable" }, 503);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ error: "Payload too large" }, 413);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return json({ error: "Payload too large" }, 413);
  }

  let body: unknown = {};
  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
  }
  if (!isRecord(body)) return json({ error: "Invalid request payload" }, 400);

  const requestedLimit = body.limit === undefined ? DEFAULT_BATCH_SIZE : body.limit;
  if (typeof requestedLimit !== "number" || !Number.isInteger(requestedLimit) || requestedLimit < 1) {
    return json({ error: "Invalid batch limit" }, 400);
  }
  const limit = Math.min(requestedLimit, MAX_BATCH_SIZE);

  try {
    const claimed = await callSupabaseRpc<unknown>(config, "claim_messaging_outbox", {
      p_limit: limit,
    });
    if (!Array.isArray(claimed)) {
      console.error("claim_messaging_outbox returned a non-array response.");
      return json({ error: "Invalid outbox response" }, 502);
    }

    const results = await Promise.all(
      (claimed as ClaimedMessage[]).map(async (message) => {
        try {
          return await processMessage(config, botToken, message);
        } catch (error) {
          console.error(
            "Telegram outbox item processing failed:",
            error instanceof Error ? error.message : "Unknown error",
          );
          return { sent: false, retried: false, dead: false, error: "Processing or completion failed." };
        }
      }),
    );

    const summary = {
      ok: results.every((item) => item.error === null || item.retried || item.dead),
      claimed: results.length,
      sent: results.filter((item) => item.sent).length,
      retried: results.filter((item) => item.retried).length,
      dead: results.filter((item) => item.dead).length,
      errors: results.filter((item) => !item.sent && !item.retried && !item.dead).length,
    };

    return json(summary, summary.errors > 0 ? 503 : 200);
  } catch (error) {
    console.error(
      "Telegram messaging worker failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return json({ error: "Messaging worker failed" }, 503);
  }
}
