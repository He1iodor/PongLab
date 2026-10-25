import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/app/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingSettings = {
  studio_id: string;
  slot_interval_minutes: number;
  allowed_durations_minutes: number[];
  booking_horizon_days: number;
  minimum_notice_minutes: number;
  hold_minutes: number;
  allow_same_day_booking: boolean;
  updated_at?: string;
};

const DEFAULTS = {
  slot_interval_minutes: 30,
  allowed_durations_minutes: [30, 60, 75, 90, 120],
  booking_horizon_days: 30,
  minimum_notice_minutes: 0,
  hold_minutes: 10,
  allow_same_day_booking: true,
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function headers(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function validInt(value: unknown, min: number, max: number, step = 1) {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= min && value <= max && (value - min) % step === 0;
}

function validate(body: Record<string, unknown>) {
  if (!validInt(body.slot_interval_minutes, 5, 60, 5))
    return "Шаг начала слотов должен быть от 5 до 60 минут с шагом 5 минут.";
  if (!Array.isArray(body.allowed_durations_minutes) ||
      body.allowed_durations_minutes.length < 1 ||
      body.allowed_durations_minutes.length > 94 ||
      !body.allowed_durations_minutes.every((v) => validInt(v, 15, 480, 5)))
    return "Выберите хотя бы одну длительность от 15 до 480 минут с шагом 5 минут.";
  if (new Set(body.allowed_durations_minutes as number[]).size !== body.allowed_durations_minutes.length)
    return "Длительности не должны повторяться.";
  if (!validInt(body.booking_horizon_days, 1, 365))
    return "Горизонт бронирования должен быть от 1 до 365 дней.";
  if (!validInt(body.minimum_notice_minutes, 0, 10080))
    return "Минимальное время до начала должно быть от 0 до 10080 минут.";
  if (!validInt(body.hold_minutes, 1, 60))
    return "Время удержания неоплаченной брони должно быть от 1 до 60 минут.";
  if (typeof body.allow_same_day_booking !== "boolean")
    return "Укажите, разрешено ли бронирование на сегодня.";
  return null;
}

async function checkStudio(url: string, key: string, studioId: string) {
  const target = new URL(`${url}/rest/v1/studios`);
  target.searchParams.set("select", "id");
  target.searchParams.set("id", `eq.${studioId}`);
  target.searchParams.set("is_active", "eq.true");
  target.searchParams.set("limit", "1");
  const response = await fetch(target, { headers: headers(key), cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось проверить клуб.");
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureRow(url: string, key: string, studioId: string) {
  const target = new URL(`${url}/rest/v1/studio_booking_settings`);
  target.searchParams.set("select", "*");
  target.searchParams.set("studio_id", `eq.${studioId}`);
  target.searchParams.set("limit", "1");
  const response = await fetch(target, { headers: headers(key), cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось загрузить настройки бронирования.");
  const rows = await response.json();
  if (Array.isArray(rows) && rows.length) return rows[0] as BookingSettings;

  const create = await fetch(`${url}/rest/v1/studio_booking_settings`, {
    method: "POST",
    headers: {
      ...headers(key),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ studio_id: studioId, ...DEFAULTS }),
    cache: "no-store",
  });
  if (!create.ok) throw new Error("Не удалось создать настройки бронирования.");
  const created = await create.json();
  if (!Array.isArray(created) || !created[0]) throw new Error("Не удалось подтвердить настройки бронирования.");
  return created[0] as BookingSettings;
}

export async function GET(request: NextRequest) {
  const access = await requireOwner(request);
  if (!access.ok) return access.response;
  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);
  const studioId = request.nextUrl.searchParams.get("studio_id");
  if (!isUuid(studioId)) return errorResponse("Укажите корректный клуб.", 400);

  try {
    if (!(await checkStudio(config.url, config.key, studioId)))
      return errorResponse("Клуб не найден или отключён.", 404);
    const settings = await ensureRow(config.url, config.key, studioId);
    return NextResponse.json({ settings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Booking settings GET error:", error);
    return errorResponse("Не удалось загрузить настройки бронирования.", 503);
  }
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    return errorResponse("Недопустимый запрос.", 403);

  const access = await requireOwner(request);
  if (!access.ok) return access.response;
  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);

  let body: unknown;
  try { body = await request.json(); }
  catch { return errorResponse("Некорректный запрос.", 400); }

  if (!body || typeof body !== "object" || Array.isArray(body))
    return errorResponse("Некорректный запрос.", 400);

  const data = body as Record<string, unknown>;
  if (!isUuid(data.studio_id)) return errorResponse("Выберите клуб.", 400);
  const validationError = validate(data);
  if (validationError) return errorResponse(validationError, 400);

  try {
    if (!(await checkStudio(config.url, config.key, data.studio_id)))
      return errorResponse("Клуб не найден или отключён.", 404);

    const settings = {
      studio_id: data.studio_id,
      slot_interval_minutes: data.slot_interval_minutes,
      allowed_durations_minutes: [...(data.allowed_durations_minutes as number[])].sort((a, b) => a - b),
      booking_horizon_days: data.booking_horizon_days,
      minimum_notice_minutes: data.minimum_notice_minutes,
      hold_minutes: data.hold_minutes,
      allow_same_day_booking: data.allow_same_day_booking,
      updated_at: new Date().toISOString(),
    };

    const target = new URL(`${config.url}/rest/v1/studio_booking_settings`);
    target.searchParams.set("on_conflict", "studio_id");
    const response = await fetch(target, {
      method: "POST",
      headers: {
        ...headers(config.key),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(settings),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Booking settings PUT failed:", response.status, await response.text());
      return errorResponse("Не удалось сохранить настройки бронирования.", 503);
    }
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows[0])
      return errorResponse("Сервер не подтвердил сохранение настроек.", 503);
    return NextResponse.json({ settings: rows[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Booking settings PUT error:", error);
    return errorResponse("Ошибка сохранения настроек бронирования.", 503);
  }
}
