import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AvailableSlot = {
  start_at: string;
  end_at: string;
  duration_minutes: number;
  price_rub: number;
  available_tables: Array<{ id: string; name: string }>;
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

async function readRows(url: string, key: string, table: string, params: Record<string, string>) {
  const target = new URL(`${url}/rest/v1/${table}`);
  for (const [name, value] of Object.entries(params)) target.searchParams.set(name, value);
  const response = await fetch(target, { headers: headers(key), cache: "no-store" });
  if (!response.ok) {
    console.error(`Booking hold query failed (${table}):`, response.status, await response.text());
    throw new Error("Не удалось проверить данные бронирования.");
  }
  return response.json();
}

async function expireOldHolds(url: string, key: string, nowIso: string) {
  const target = new URL(`${url}/rest/v1/bookings`);
  target.searchParams.set("status", "eq.pending_payment");
  target.searchParams.set("hold_expires_at", `lte.${nowIso}`);
  const response = await fetch(target, {
    method: "PATCH",
    headers: {
      ...headers(key),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ status: "expired" }),
    cache: "no-store",
  });
  if (!response.ok) {
    console.error("Expired booking holds cleanup failed:", response.status, await response.text());
    throw new Error("Не удалось освободить истёкшие бронирования. Повторите попытку.");
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    return errorResponse("Недопустимый запрос.", 403);

  const sessionToken = request.cookies.get("ponglab_session")?.value;
  if (!sessionToken || !/^[a-f0-9]{64}$/i.test(sessionToken))
    return errorResponse("Сначала войдите в личный кабинет и подтвердите номер телефона.", 401);

  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);

  let body: unknown;
  try { body = await request.json(); }
  catch { return errorResponse("Некорректный запрос.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return errorResponse("Некорректный запрос.", 400);

  const data = body as Record<string, unknown>;
  const studioId = data.studio_id;
  const tableId = data.table_id;
  const date = data.date;
  const startAtInput = data.start_at;
  const duration = data.duration_minutes;

  if (!isUuid(studioId) || !isUuid(tableId))
    return errorResponse("Не удалось определить клуб или стол.", 400);
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return errorResponse("Укажите дату бронирования.", 400);
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date)
    return errorResponse("Укажите корректную дату.", 400);
  if (typeof startAtInput !== "string" || !Number.isFinite(Date.parse(startAtInput)))
    return errorResponse("Укажите корректное время начала.", 400);
  if (!Number.isInteger(duration) || (duration as number) < 15 || (duration as number) > 480 || (duration as number) % 5 !== 0)
    return errorResponse("Недопустимая длительность бронирования.", 400);

  const startAtIso = new Date(startAtInput).toISOString();
  const tokenHash = createHash("sha256").update(sessionToken).digest("hex");

  try {
    // Сверяем сессию с базой и получаем пользователя только по серверной сессии.
    const sessions = await readRows(config.url, config.key, "user_sessions", {
      select: "user_id",
      token_hash: `eq.${tokenHash}`,
      expires_at: `gt.${new Date().toISOString()}`,
      limit: "1",
    });
    if (!Array.isArray(sessions) || !sessions[0]?.user_id)
      return errorResponse("Сессия истекла. Войдите в личный кабинет повторно.", 401);
    const userId = sessions[0].user_id as string;

    // Убираем просроченные удержания перед созданием новой брони.
    const now = new Date();
    await expireOldHolds(config.url, config.key, now.toISOString());

    // Проверяем клубные настройки, в том числе индивидуальное время удержания.
    const settingsRows = await readRows(config.url, config.key, "studio_booking_settings", {
      select: "hold_minutes,allowed_durations_minutes",
      studio_id: `eq.${studioId}`,
      limit: "1",
    });
    const settings = Array.isArray(settingsRows) ? settingsRows[0] : null;
    if (!settings) return errorResponse("Настройки бронирования клуба не найдены.", 409);
    const allowedDurations = Array.isArray(settings.allowed_durations_minutes)
      ? settings.allowed_durations_minutes.map(Number)
      : [];
    if (!allowedDurations.includes(duration as number))
      return errorResponse("Эта длительность бронирования сейчас недоступна.", 400);
    const holdMinutes = Number(settings.hold_minutes);
    if (!Number.isInteger(holdMinutes) || holdMinutes < 1 || holdMinutes > 60)
      return errorResponse("У клуба некорректно настроено время удержания брони.", 503);

    // Источник цены и свободных столов — серверный API доступности, а не данные клиента.
    const availabilityUrl = new URL("/api/availability", request.url);
    availabilityUrl.searchParams.set("studio_id", studioId as string);
    availabilityUrl.searchParams.set("date", date);
    availabilityUrl.searchParams.set("duration_minutes", String(duration));
    const availabilityResponse = await fetch(availabilityUrl, { cache: "no-store" });
    const availabilityData = await availabilityResponse.json().catch(() => ({}));
    if (!availabilityResponse.ok)
      return errorResponse(availabilityData.error || "Не удалось проверить доступность слота.", availabilityResponse.status);

    const slots = Array.isArray(availabilityData.slots) ? availabilityData.slots as AvailableSlot[] : [];
    const slot = slots.find((candidate) =>
      candidate.start_at === startAtIso &&
      candidate.duration_minutes === duration &&
      candidate.available_tables.some((table) => table.id === tableId)
    );
    if (!slot)
      return errorResponse("Этот слот уже недоступен или его параметры изменились. Обновите календарь.", 409);

    const holdExpiresAt = new Date(Date.now() + holdMinutes * 60_000).toISOString();

    const insertResponse = await fetch(`${config.url}/rest/v1/bookings`, {
      method: "POST",
      headers: {
        ...headers(config.key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: userId,
        table_id: tableId,
        start_at: slot.start_at,
        end_at: slot.end_at,
        price_rub: slot.price_rub,
        status: "pending_payment",
        payment_provider: "tbank",
        payment_status: "pending",
        hold_expires_at: holdExpiresAt,
      }),
      cache: "no-store",
    });

    if (!insertResponse.ok) {
      const details = await insertResponse.text();
      console.error("Booking hold insert failed:", insertResponse.status, details);
      if (insertResponse.status === 409 || details.includes("bookings_no_overlap") || details.includes("23P01"))
        return errorResponse("Кто-то успел занять этот слот. Обновите календарь и выберите другое время.", 409);
      if (details.includes("bookings_payment_provider_check"))
        return errorResponse("База данных ещё не обновлена для выбранного платёжного провайдера. Выполните SQL-миграцию из комплекта.", 503);
      return errorResponse("Не удалось создать временную бронь. Повторите попытку.", 503);
    }

    const rows = await insertResponse.json();
    if (!Array.isArray(rows) || !rows[0]?.id)
      return errorResponse("Сервер не подтвердил создание брони.", 503);

    return NextResponse.json({
      booking: {
        id: rows[0].id,
        start_at: rows[0].start_at,
        end_at: rows[0].end_at,
        price_rub: rows[0].price_rub,
        status: rows[0].status,
        hold_expires_at: rows[0].hold_expires_at,
        table_id: tableId,
      },
      next_step: "payment",
    }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Booking hold POST error:", error);
    return errorResponse(error instanceof Error ? error.message : "Не удалось создать временную бронь.", 503);
  }
}
