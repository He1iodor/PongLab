import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTokenFromRequest,
  resolveSessionUserId,
} from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  phone: string;
  role: "customer" | "owner" | "staff";
  created_at: string;
  full_name: string | null;
};

function getConfig() {
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

async function getUserId(request: NextRequest) {
  const token = getSessionTokenFromRequest(request);
  if (!token) return null;
  return resolveSessionUserId(token);
}

export async function GET(request: NextRequest) {
  const config = getConfig();
  if (!config) return noStoreJson({ error: "Сервис временно недоступен." }, 503);

  try {
    const userId = await getUserId(request);
    if (!userId) return noStoreJson({ authenticated: false }, 401);

    const target = new URL(`${config.url}/rest/v1/users`);
    target.searchParams.set("select", "id,phone,role,created_at,full_name");
    target.searchParams.set("id", `eq.${userId}`);
    target.searchParams.set("limit", "1");

    const response = await fetch(target, {
      headers: apiHeaders(config.key),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error("Profile GET failed:", response.status);
      return noStoreJson({ error: "Не удалось загрузить профиль." }, 503);
    }

    const rows = (await response.json()) as ProfileRow[];
    const user = Array.isArray(rows) ? rows[0] : null;
    if (!user) return noStoreJson({ error: "Профиль не найден." }, 404);

    return noStoreJson({
      authenticated: true,
      profile: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        createdAt: user.created_at,
        full_name: user.full_name ?? "",
      },
    });
  } catch (error) {
    console.error("Profile GET error:", error);
    return noStoreJson({ error: "Ошибка при загрузке профиля." }, 503);
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

  const rawName = (body as Record<string, unknown>).full_name;
  if (typeof rawName !== "string") {
    return noStoreJson({ error: "Укажите имя." }, 400);
  }

  const fullName = rawName.trim();
  if (fullName.length < 2 || fullName.length > 80) {
    return noStoreJson({ error: "Имя должно содержать от 2 до 80 символов." }, 400);
  }

  try {
    const userId = await getUserId(request);
    if (!userId) return noStoreJson({ authenticated: false }, 401);

    const target = new URL(`${config.url}/rest/v1/users`);
    target.searchParams.set("id", `eq.${userId}`);
    target.searchParams.set("select", "id,full_name");

    const response = await fetch(target, {
      method: "PATCH",
      headers: {
        ...apiHeaders(config.key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ full_name: fullName }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error("Profile PATCH failed:", response.status, await response.text());
      return noStoreJson({ error: "Не удалось сохранить имя." }, 503);
    }

    const rows = (await response.json()) as Array<{ id: string; full_name: string }>;
    if (!Array.isArray(rows) || rows.length !== 1) {
      return noStoreJson({ error: "Профиль не найден." }, 404);
    }

    return noStoreJson({ success: true, full_name: rows[0].full_name });
  } catch (error) {
    console.error("Profile PATCH error:", error);
    return noStoreJson({ error: "Ошибка при сохранении профиля." }, 503);
  }
}
