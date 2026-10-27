import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/app/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function validTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
}
function validDate(value: unknown): value is string {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function headers(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }

async function checkStudio(url: string, key: string, studioId: string) {
  const target = new URL(`${url}/rest/v1/studios`);
  target.searchParams.set("select", "id");
  target.searchParams.set("id", `eq.${studioId}`);
  target.searchParams.set("is_active", "eq.true");
  target.searchParams.set("limit", "1");
  const response = await fetch(target, { headers: headers(key), cache: "no-store" });
  if (!response.ok) {
    console.error("Price studio check failed:", response.status, await response.text());
    throw new Error("Не удалось проверить клуб.");
  }
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

function validateRule(data: Record<string, unknown>) {
  const weekday = data.weekday;
  const startsAt = data.starts_at;
  const endsAt = data.ends_at;
  const duration = data.duration_minutes;
  const price = data.price_rub;
  const from = data.effective_from;
  const to = data.effective_to;

  if (!Number.isInteger(weekday) || (weekday as number) < 1 || (weekday as number) > 7)
    return "Выберите день недели.";
  if (!validTime(startsAt) || !validTime(endsAt))
    return "Укажите корректное время начала и окончания.";
  const minutes = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
  if (minutes(startsAt) >= minutes(endsAt))
    return "Время окончания должно быть позже времени начала.";
  if (duration !== 60)
    return "Тариф задаёт стоимость одного слота продолжительностью 60 минут.";
  if (typeof price !== "number" || !Number.isInteger(price) || price <= 0 || price > 1000000)
    return "Цена должна быть целым числом от 1 до 1 000 000 рублей.";
  if (!validDate(from) || !validDate(to))
    return "Укажите корректный период действия тарифа.";
  if (typeof from === "string" && from !== "" && typeof to === "string" && to !== "" && from > to)
    return "Дата окончания не может быть раньше даты начала.";
  if (typeof data.is_active !== "boolean") return "Укажите, активен ли тариф.";
  return null;
}

function normalizeRule(data: Record<string, unknown>) {
  const normalizeTime = (value: string) => value.length === 5 ? `${value}:00` : value;
  return {
    weekday: data.weekday,
    starts_at: normalizeTime(data.starts_at as string),
    ends_at: normalizeTime(data.ends_at as string),
    duration_minutes: 60,
    price_rub: data.price_rub,
    effective_from: data.effective_from || null,
    effective_to: data.effective_to || null,
    is_active: data.is_active,
  };
}

export async function GET(request: NextRequest) {
  const access = await requireOwner(request);
  if (!access.ok) return access.response;
  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);
  const studioId = request.nextUrl.searchParams.get("studio_id");
  if (!isUuid(studioId)) return errorResponse("Укажите корректный клуб.", 400);
  try {
    if (!(await checkStudio(config.url, config.key, studioId))) return errorResponse("Клуб не найден или отключён.", 404);
    const target = new URL(`${config.url}/rest/v1/studio_slot_price_rules`);
    target.searchParams.set("select", "*");
    target.searchParams.set("studio_id", `eq.${studioId}`);
    target.searchParams.set("order", "weekday.asc,starts_at.asc,duration_minutes.asc");
    const response = await fetch(target, { headers: headers(config.key), cache: "no-store" });
    if (!response.ok) {
      console.error("Prices GET failed:", response.status, await response.text());
      return errorResponse("Не удалось загрузить тарифы.", 503);
    }
    return NextResponse.json({ rules: await response.json() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Prices GET error:", error);
    return errorResponse("Ошибка загрузки тарифов.", 503);
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return errorResponse("Недопустимый запрос.", 403);
  const access = await requireOwner(request);
  if (!access.ok) return access.response;
  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("Некорректный запрос.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse("Некорректный запрос.", 400);
  const data = body as Record<string, unknown>;
  if (!isUuid(data.studio_id)) return errorResponse("Выберите клуб.", 400);
  const validationError = validateRule(data);
  if (validationError) return errorResponse(validationError, 400);
  try {
    if (!(await checkStudio(config.url, config.key, data.studio_id)) ) return errorResponse("Клуб не найден или отключён.", 404);
    const response = await fetch(`${config.url}/rest/v1/studio_slot_price_rules`, {
      method: "POST",
      headers: { ...headers(config.key), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ studio_id: data.studio_id, ...normalizeRule(data) }),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Prices POST failed:", response.status, await response.text());
      return errorResponse("Не удалось сохранить тариф.", 503);
    }
    const rows = await response.json();
    return NextResponse.json({ rule: rows[0] }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Prices POST error:", error);
    return errorResponse("Ошибка сохранения тарифа.", 503);
  }
}

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return errorResponse("Недопустимый запрос.", 403);
  const access = await requireOwner(request);
  if (!access.ok) return access.response;
  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("Некорректный запрос.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse("Некорректный запрос.", 400);
  const data = body as Record<string, unknown>;
  if (!isUuid(data.id) || !isUuid(data.studio_id)) return errorResponse("Не удалось определить тариф или клуб.", 400);
  const validationError = validateRule(data);
  if (validationError) return errorResponse(validationError, 400);
  try {
    if (!(await checkStudio(config.url, config.key, data.studio_id))) return errorResponse("Клуб не найден или отключён.", 404);
    const target = new URL(`${config.url}/rest/v1/studio_slot_price_rules`);
    target.searchParams.set("id", `eq.${data.id}`);
    target.searchParams.set("studio_id", `eq.${data.studio_id}`);
    const response = await fetch(target, {
      method: "PATCH",
      headers: { ...headers(config.key), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(normalizeRule(data)),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Prices PATCH failed:", response.status, await response.text());
      return errorResponse("Не удалось изменить тариф.", 503);
    }
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) return errorResponse("Тариф не найден.", 404);
    return NextResponse.json({ rule: rows[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Prices PATCH error:", error);
    return errorResponse("Ошибка изменения тарифа.", 503);
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return errorResponse("Недопустимый запрос.", 403);
  const access = await requireOwner(request);
  if (!access.ok) return access.response;
  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);
  const id = request.nextUrl.searchParams.get("id");
  const studioId = request.nextUrl.searchParams.get("studio_id");
  if (!isUuid(id) || !isUuid(studioId)) return errorResponse("Укажите корректный тариф и клуб.", 400);
  try {
    if (!(await checkStudio(config.url, config.key, studioId))) return errorResponse("Клуб не найден или отключён.", 404);
    const target = new URL(`${config.url}/rest/v1/studio_slot_price_rules`);
    target.searchParams.set("id", `eq.${id}`);
    target.searchParams.set("studio_id", `eq.${studioId}`);
    const response = await fetch(target, { method: "DELETE", headers: headers(config.key), cache: "no-store" });
    if (!response.ok) {
      console.error("Prices DELETE failed:", response.status, await response.text());
      return errorResponse("Не удалось удалить тариф.", 503);
    }
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Prices DELETE error:", error);
    return errorResponse("Ошибка удаления тарифа.", 503);
  }
}
