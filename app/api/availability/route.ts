
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DURATIONS = [30, 60, 75, 90, 120];

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function headers(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

function isUuid(value: string | null): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function timeString(value: number) {
  const hours = Math.floor(value / 60);
  const mins = value % 60;

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function weekdayForDate(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

// Переводит местные дату и время клуба в UTC.
// Это нужно, чтобы корректно сравнивать расписание с бронированиями.
function localDateTimeToUtc(
  date: string,
  time: string,
  timezone: string
) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;

  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));

    const part = (type: string) =>
      Number(parts.find((item) => item.type === type)?.value);

    const represented = Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute")
    );

    const adjustment = target - represented;
    guess += adjustment;

    if (adjustment === 0) break;
  }

  return new Date(guess);
}

async function fetchRows(
  url: string,
  key: string,
  table: string,
  params: Record<string, string>
) {
  const target = new URL(`${url}/rest/v1/${table}`);

  for (const [name, value] of Object.entries(params)) {
    target.searchParams.set(name, value);
  }

  const response = await fetch(target, {
    headers: headers(key),
    cache: "no-store",
  });

  if (!response.ok) {
    console.error(
      `Availability query failed (${table}):`,
      response.status,
      await response.text()
    );

    throw new Error("Не удалось рассчитать доступные слоты.");
  }

  return response.json();
}

export async function GET(request: NextRequest) {
  const config = getConfig();

  if (!config) {
    return errorResponse("Сервис временно недоступен.", 503);
  }

  const params = request.nextUrl.searchParams;
  const studioId = params.get("studio_id");
  const date = params.get("date");
  const requestedDuration = params.get("duration_minutes");

  if (!isUuid(studioId)) {
    return errorResponse("Укажите корректный клуб.", 400);
  }

  if (!validDate(date)) {
    return errorResponse("Укажите дату в формате ГГГГ-ММ-ДД.", 400);
  }

  let durations = DURATIONS;

  if (requestedDuration !== null) {
    const parsed = Number(requestedDuration);

    if (!DURATIONS.includes(parsed)) {
      return errorResponse("Недопустимая длительность бронирования.", 400);
    }

    durations = [parsed];
  }

  try {
    // 1. Проверяем, что клуб существует и активен.
    const studios = await fetchRows(
      config.url,
      config.key,
      "studios",
      {
        select: "id,timezone",
        id: `eq.${studioId}`,
        is_active: "eq.true",
        limit: "1",
      }
    );

    if (!Array.isArray(studios) || studios.length === 0) {
      return errorResponse("Клуб не найден или отключён.", 404);
    }

    const timezone = studios[0].timezone || "Europe/Moscow";

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      return errorResponse("У клуба некорректный часовой пояс.", 500);
    }

    // Не показываем даты в прошлом.
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    if (date < today) {
      return NextResponse.json(
        { date, timezone, slots: [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // 2. Определяем рабочие интервалы: исключение даты важнее расписания.
    const exceptions = await fetchRows(
      config.url,
      config.key,
      "studio_date_exceptions",
      {
        select: "id,is_closed",
        studio_id: `eq.${studioId}`,
        exception_date: `eq.${date}`,
        limit: "1",
      }
    );

    let workingIntervals: Array<{
      opens_at: string;
      closes_at: string;
    }> = [];

    if (exceptions.length > 0) {
      const exception = exceptions[0];

      if (exception.is_closed) {
        return NextResponse.json(
          { date, timezone, slots: [] },
          { headers: { "Cache-Control": "no-store" } }
        );
      }

      workingIntervals = await fetchRows(
        config.url,
        config.key,
        "studio_date_exception_intervals",
        {
          select: "opens_at,closes_at",
          exception_id: `eq.${exception.id}`,
          order: "opens_at.asc",
        }
      );
    } else {
      const schedules = await fetchRows(
        config.url,
        config.key,
        "studio_weekly_schedule",
        {
          select: "id,is_open",
          studio_id: `eq.${studioId}`,
          weekday: `eq.${weekdayForDate(date)}`,
          limit: "1",
        }
      );

      if (schedules.length === 0 || !schedules[0].is_open) {
        return NextResponse.json(
          { date, timezone, slots: [] },
          { headers: { "Cache-Control": "no-store" } }
        );
      }

      workingIntervals = await fetchRows(
        config.url,
        config.key,
        "studio_weekly_schedule_intervals",
        {
          select: "opens_at,closes_at",
          schedule_id: `eq.${schedules[0].id}`,
          order: "opens_at.asc",
        }
      );
    }

    if (workingIntervals.length === 0) {
      return NextResponse.json(
        { date, timezone, slots: [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // 3. Загружаем активные столы клуба.
    const tables = await fetchRows(
      config.url,
      config.key,
      "studio_tables",
      {
        select: "id,name",
        studio_id: `eq.${studioId}`,
        is_active: "eq.true",
        order: "created_at.asc",
      }
    );

    if (tables.length === 0) {
      return NextResponse.json(
        { date, timezone, slots: [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // 4. Загружаем бронирования, пересекающиеся с местными сутками клуба.
    const dayStart = localDateTimeToUtc(date, "00:00", timezone);
    const nextDate = new Date(
      Date.UTC(
        Number(date.slice(0, 4)),
        Number(date.slice(5, 7)) - 1,
        Number(date.slice(8, 10)) + 1
      )
    ).toISOString().slice(0, 10);
    const dayEnd = localDateTimeToUtc(nextDate, "00:00", timezone);

    const tableIds = tables.map((table: { id: string }) => table.id);

    const bookings = await fetchRows(
      config.url,
      config.key,
      "bookings",
      {
        select:
          "table_id,start_at,end_at,status,payment_status,hold_expires_at",
        table_id: `in.(${tableIds.join(",")})`,
        status: "in.(pending_payment,confirmed)",
        start_at: `lt.${dayEnd.toISOString()}`,
        end_at: `gt.${dayStart.toISOString()}`,
      }
    );

    const now = Date.now();

    const blockingBookings = bookings.filter(
      (booking: {
        status: string;
        hold_expires_at: string | null;
      }) => {
        if (booking.status === "confirmed") return true;

        // Не считаем просроченное удержание доступным,
        // если срок удержания ещё не был очищен в базе.
        if (!booking.hold_expires_at) return true;

        return new Date(booking.hold_expires_at).getTime() > now;
      }
    );

    // 5. Загружаем активные тарифы.
    const rules = await fetchRows(
      config.url,
      config.key,
      "studio_slot_price_rules",
      {
        select:
          "weekday,starts_at,ends_at,duration_minutes,price_rub,effective_from,effective_to,is_active",
        studio_id: `eq.${studioId}`,
        is_active: "eq.true",
        weekday: `eq.${weekdayForDate(date)}`,
        order: "starts_at.asc",
      }
    );

    const activeRules = rules.filter(
      (rule: {
        effective_from: string | null;
        effective_to: string | null;
      }) =>
        (!rule.effective_from || rule.effective_from <= date) &&
        (!rule.effective_to || rule.effective_to >= date)
    );

    // 6. Формируем начала слотов с шагом 30 минут.
    const slots: Array<{
      start_at: string;
      end_at: string;
      starts_at: string;
      ends_at: string;
      duration_minutes: number;
      price_rub: number;
      available_tables: Array<{ id: string; name: string }>;
    }> = [];

    const nowUtc = Date.now();

    for (const interval of workingIntervals) {
      const opens = minutes(interval.opens_at);
      const closes = minutes(interval.closes_at);

      for (
        let start = opens;
        start < closes;
        start += 30
      ) {
        for (const duration of durations) {
          const end = start + duration;

          // Слот должен полностью помещаться в рабочий интервал.
          if (end > closes) continue;

          // Тариф должен подходить по длительности и покрывать слот целиком.
          const matchingRules = activeRules.filter(
            (rule: {
              duration_minutes: number;
              starts_at: string;
              ends_at: string;
            }) =>
              rule.duration_minutes === duration &&
              minutes(rule.starts_at) <= start &&
              minutes(rule.ends_at) >= end
          );

          if (matchingRules.length === 0) continue;

          // Если тарифы пересекаются, нельзя безопасно выбрать цену наугад.
          if (matchingRules.length > 1) {
            console.error(
              "Overlapping price rules:",
              studioId,
              date,
              timeString(start),
              duration
            );

            return errorResponse(
              "В настройках цен обнаружены пересекающиеся тарифы. Проверьте тарифы клуба.",
              409
            );
          }

          const rule = matchingRules[0];
          const localStart = timeString(start);
          const localEnd = timeString(end);

          const startAt = localDateTimeToUtc(
            date,
            localStart,
            timezone
          );
          const endAt = localDateTimeToUtc(
            date,
            localEnd,
            timezone
          );

          // Не предлагаем слоты, время начала которых уже прошло.
          if (startAt.getTime() <= nowUtc) continue;

          const availableTables = tables.filter(
            (table: { id: string }) =>
              !blockingBookings.some(
                (booking: {
                  table_id: string;
                  start_at: string;
                  end_at: string;
                }) =>
                  booking.table_id === table.id &&
                  new Date(booking.start_at).getTime() < endAt.getTime() &&
                  new Date(booking.end_at).getTime() > startAt.getTime()
              )
          );

          slots.push({
            start_at: startAt.toISOString(),
            end_at: endAt.toISOString(),
            starts_at: localStart,
            ends_at: localEnd,
            duration_minutes: duration,
            price_rub: rule.price_rub,
            available_tables: availableTables.map(
              (table: { id: string; name: string }) => ({
                id: table.id,
                name: table.name,
              })
            ),
          });
        }
      }
    }

    slots.sort(
      (a, b) =>
        a.start_at.localeCompare(b.start_at) ||
        a.duration_minutes - b.duration_minutes
    );

    return NextResponse.json(
      { date, timezone, slots },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Availability GET error:", error);

    return errorResponse(
      error instanceof Error
        ? error.message
        : "Не удалось рассчитать доступные слоты.",
      503
    );
  }
}
