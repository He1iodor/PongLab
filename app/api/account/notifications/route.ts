import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTokenFromRequest,
  resolveSessionUserId,
} from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function apiHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function resolveUser(request: NextRequest) {
  const token = getSessionTokenFromRequest(request);
  if (!token) return null;
  return resolveSessionUserId(token);
}

export async function GET(request: NextRequest) {
  const config = getConfig();
  if (!config) return noStoreJson({ error: "Сервис временно недоступен." }, 503);

  try {
    const userId = await resolveUser(request);
    if (!userId) return noStoreJson({ error: "Войдите в личный кабинет." }, 401);

    const listUrl = new URL(`${config.url}/rest/v1/account_notifications`);
    listUrl.searchParams.set(
      "select",
      "id,type,title,message,booking_id,payment_group_id,read_at,created_at",
    );
    listUrl.searchParams.set("user_id", `eq.${userId}`);
    listUrl.searchParams.set("order", "created_at.desc");
    listUrl.searchParams.set("limit", "50");

    const listResponse = await fetch(listUrl, {
      headers: apiHeaders(config.key),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!listResponse.ok) {
      console.error("Notifications list failed:", listResponse.status);
      return noStoreJson({ error: "Не удалось загрузить уведомления." }, 503);
    }

    const notifications = await listResponse.json();

    const countUrl = new URL(`${config.url}/rest/v1/account_notifications`);
    countUrl.searchParams.set("select", "id");
    countUrl.searchParams.set("user_id", `eq.${userId}`);
    countUrl.searchParams.set("read_at", "is.null");

    const countResponse = await fetch(countUrl, {
      headers: {
        ...apiHeaders(config.key),
        Prefer: "count=exact",
        Range: "0-0",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    let unreadCount = 0;
    if (countResponse.ok) {
      const contentRange = countResponse.headers.get("content-range") ?? "";
      const total = contentRange.match(/\/(\d+)$/);
      if (total) unreadCount = Number(total[1]) || 0;
    }

    return noStoreJson({
      notifications: Array.isArray(notifications) ? notifications : [],
      unread_count: unreadCount,
    });
  } catch (error) {
    console.error("Notifications GET error:", error);
    return noStoreJson({ error: "Ошибка при загрузке уведомлений." }, 503);
  }
}

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return noStoreJson({ error: "Недопустимый запрос." }, 403);
  }

  const config = getConfig();
  if (!config) return noStoreJson({ error: "Сервис временно недоступен." }, 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: "Некорректный JSON." }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return noStoreJson({ error: "Некорректный запрос." }, 400);
  }

  const payload = body as Record<string, unknown>;
  const markAll = payload.all === true;
  const ids = payload.ids;

  if (!markAll) {
    if (
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 50 ||
      !ids.every((id) => typeof id === "string" && UUID_RE.test(id))
    ) {
      return noStoreJson({ error: "Передан некорректный список уведомлений." }, 400);
    }
  }

  try {
    const userId = await resolveUser(request);
    if (!userId) return noStoreJson({ error: "Сессия истекла." }, 401);

    const target = new URL(`${config.url}/rest/v1/account_notifications`);
    target.searchParams.set("user_id", `eq.${userId}`);
    target.searchParams.set("read_at", "is.null");
    if (!markAll) {
      target.searchParams.set("id", `in.(${(ids as string[]).join(",")})`);
    }
    target.searchParams.set("select", "id");

    const response = await fetch(target, {
      method: "PATCH",
      headers: {
        ...apiHeaders(config.key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ read_at: new Date().toISOString() }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error("Notifications PATCH failed:", response.status, await response.text());
      return noStoreJson({ error: "Не удалось обновить уведомления." }, 503);
    }

    const updated = await response.json();
    return noStoreJson({
      success: true,
      updated_count: Array.isArray(updated) ? updated.length : 0,
    });
  } catch (error) {
    console.error("Notifications PATCH error:", error);
    return noStoreJson({ error: "Ошибка при обновлении уведомлений." }, 503);
  }
}
