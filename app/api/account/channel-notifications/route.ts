import { NextRequest, NextResponse } from "next/server";
import { getSessionTokenFromRequest, resolveSessionUserId } from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Channel = "telegram" | "max";
const TABLES = {
  telegram: { table: "telegram_accounts", identity: "telegram_user_id" },
  max: { table: "max_accounts", identity: "max_user_id" },
} as const;

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}
function headers(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}
async function userId(request: NextRequest) {
  const token = getSessionTokenFromRequest(request);
  return token ? resolveSessionUserId(token) : null;
}
function channelOf(value: unknown): Channel | null {
  return value === "telegram" || value === "max" ? value : null;
}
function accountUrl(base: string, channel: Channel, id: string) {
  const meta = TABLES[channel];
  const url = new URL(`${base}/rest/v1/${meta.table}`);
  url.searchParams.set("user_id", `eq.${id}`);
  url.searchParams.set(meta.identity, "not.is.null");
  url.searchParams.set("unlinked_at", "is.null");
  return url;
}

export async function GET(request: NextRequest) {
  const cfg = config();
  if (!cfg) return reply({ error: "Сервис временно недоступен." }, 503);
  const channel = channelOf(request.nextUrl.searchParams.get("channel"));
  if (!channel) return reply({ error: "Не указан канал уведомлений." }, 400);

  try {
    const id = await userId(request);
    if (!id) return reply({ error: "Войдите в личный кабинет." }, 401);

    const target = accountUrl(cfg.url, channel, id);
    target.searchParams.set("select", "notifications_enabled");
    target.searchParams.set("limit", "1");
    const response = await fetch(target, {
      headers: headers(cfg.key), cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error("Channel notification settings GET failed:", channel, response.status);
      return reply({ error: "Не удалось загрузить настройку уведомлений." }, 503);
    }
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) return reply({ error: "Некорректный ответ сервера." }, 503);
    const account = rows[0] as { notifications_enabled?: boolean } | undefined;
    return reply({ channel, linked: Boolean(account), enabled: account?.notifications_enabled !== false });
  } catch (error) {
    console.error("Channel notification settings GET error:", error);
    return reply({ error: "Не удалось загрузить настройку уведомлений." }, 503);
  }
}

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) return reply({ error: "Недопустимый запрос." }, 403);

  const cfg = config();
  if (!cfg) return reply({ error: "Сервис временно недоступен." }, 503);

  let body: unknown;
  try { body = await request.json(); }
  catch { return reply({ error: "Некорректный JSON." }, 400); }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reply({ error: "Некорректный запрос." }, 400);
  }
  const payload = body as Record<string, unknown>;
  const channel = channelOf(payload.channel);
  if (!channel || typeof payload.enabled !== "boolean") {
    return reply({ error: "Переданы некорректные настройки." }, 400);
  }

  try {
    const id = await userId(request);
    if (!id) return reply({ error: "Сессия истекла. Войдите повторно." }, 401);

    const target = accountUrl(cfg.url, channel, id);
    target.searchParams.set("select", "notifications_enabled");
    const response = await fetch(target, {
      method: "PATCH",
      headers: { ...headers(cfg.key), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ notifications_enabled: payload.enabled, updated_at: new Date().toISOString() }),
      cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error("Channel notification settings PATCH failed:", channel, response.status);
      return reply({ error: "Не удалось сохранить настройку уведомлений." }, 503);
    }
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) return reply({ error: "Сначала подключите этот аккаунт." }, 409);
    const account = rows[0] as { notifications_enabled: boolean };
    return reply({ success: true, channel, enabled: account.notifications_enabled });
  } catch (error) {
    console.error("Channel notification settings PATCH error:", error);
    return reply({ error: "Не удалось сохранить настройку уведомлений." }, 503);
  }
}
