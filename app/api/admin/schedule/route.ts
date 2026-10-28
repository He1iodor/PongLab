
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/app/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Interval = {
  opens_at: string;
  closes_at: string;
};

type DayInput = {
  weekday: number;
  is_open: boolean;
  intervals: Interval[];
};

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function headers(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

function validTime(value: unknown): value is string {
  return typeof value === "string" &&
    /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

async function checkStudio(
  url: string,
  key: string,
  studioId: string
) {
  const target = new URL(`${url}/rest/v1/studios`);
  target.searchParams.set("select", "id");
  target.searchParams.set("id", `eq.${studioId}`);
  target.searchParams.set("is_active", "eq.true");
  target.searchParams.set("limit", "1");

  const response = await fetch(target, {
    headers: headers(key),
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("Schedule studio check failed:", response.status, await response.text());
    throw new Error("Не удалось проверить клуб.");
  }

  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

export async function GET(request: NextRequest) {
  const access = await requireOwner(request);
  if (!access.ok) return access.response;

  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);

  const studioId = request.nextUrl.searchParams.get("studio_id");
  if (!studioId || !isUuid(studioId)) {
    return errorResponse("Укажите корректный клуб.", 400);
  }

  try {
    if (!(await checkStudio(config.url, config.key, studioId))) {
      return errorResponse("Клуб не найден или отключён.", 404);
    }

    const scheduleUrl = new URL(`${config.url}/rest/v1/studio_weekly_schedule`);
    scheduleUrl.searchParams.set(
      "select",
      "id,studio_id,weekday,is_open"
    );
    scheduleUrl.searchParams.set("studio_id", `eq.${studioId}`);
    scheduleUrl.searchParams.set("order", "weekday.asc");

    const scheduleResponse = await fetch(scheduleUrl, {
      headers: headers(config.key),
      cache: "no-store",
    });

    if (!scheduleResponse.ok) {
      console.error("Weekly schedule GET failed:", scheduleResponse.status, await scheduleResponse.text());
      return errorResponse("Не удалось загрузить расписание.", 503);
    }

    const scheduleRows = await scheduleResponse.json();

    const intervalUrl = new URL(`${config.url}/rest/v1/studio_weekly_schedule_intervals`);
    intervalUrl.searchParams.set(
      "select",
      "id,schedule_id,opens_at,closes_at"
    );
    intervalUrl.searchParams.set("order", "opens_at.asc");

    const intervalResponse = await fetch(intervalUrl, {
      headers: headers(config.key),
      cache: "no-store",
    });

    if (!intervalResponse.ok) {
      console.error("Weekly intervals GET failed:", intervalResponse.status, await intervalResponse.text());
      return errorResponse("Не удалось загрузить рабочие интервалы.", 503);
    }

    const intervalRows = await intervalResponse.json();

    const days = Array.from({ length: 7 }, (_, index) => {
      const weekday = index + 1;
      const schedule = scheduleRows.find(
        (row: { weekday: number }) => row.weekday === weekday
      );

      const intervals = schedule
        ? intervalRows
            .filter(
              (row: { schedule_id: string }) => row.schedule_id === schedule.id
            )
            .map(
              (row: { opens_at: string; closes_at: string }) => ({
                opens_at: row.opens_at,
                closes_at: row.closes_at,
              })
            )
        : [];

      return {
        weekday,
        is_open: schedule?.is_open ?? false,
        intervals,
      };
    });

    return NextResponse.json(
      { days },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Weekly schedule GET error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Ошибка загрузки расписания.",
      503
    );
  }
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("Недопустимый запрос.", 403);
  }

  const access = await requireOwner(request);
  if (!access.ok) return access.response;

  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Некорректный запрос.", 400);
  }

  if (!body || typeof body !== "object") {
    return errorResponse("Некорректный запрос.", 400);
  }

  const data = body as Record<string, unknown>;
  const studioId = data.studio_id;
  const days = data.days;

  if (typeof studioId !== "string" || !isUuid(studioId)) {
    return errorResponse("Выберите клуб.", 400);
  }

  if (!Array.isArray(days) || days.length !== 7) {
    return errorResponse("Передайте расписание на все семь дней.", 400);
  }

  const seen = new Set<number>();

  for (const item of days as DayInput[]) {
    if (
      !item ||
      !Number.isInteger(item.weekday) ||
      item.weekday < 1 ||
      item.weekday > 7 ||
      seen.has(item.weekday) ||
      typeof item.is_open !== "boolean" ||
      !Array.isArray(item.intervals)
    ) {
      return errorResponse("Некорректные данные дня недели.", 400);
    }

    seen.add(item.weekday);

    if (!item.is_open && item.intervals.length > 0) {
      return errorResponse("У закрытого дня не должно быть рабочих интервалов.", 400);
    }

    if (item.intervals.length > 10) {
      return errorResponse("Для одного дня разрешено не более 10 интервалов.", 400);
    }

    const normalized: Array<{ start: number; end: number }> = [];

    for (const interval of item.intervals) {
      if (!validTime(interval.opens_at) || !validTime(interval.closes_at)) {
        return errorResponse("Укажите корректное время интервала.", 400);
      }

      const start = toMinutes(interval.opens_at);
      const end = toMinutes(interval.closes_at);

      if (start >= end) {
        return errorResponse("Время окончания должно быть позже начала.", 400);
      }

      if (normalized.some((other) => start < other.end && end > other.start)) {
        return errorResponse("Рабочие интервалы одного дня не должны пересекаться.", 400);
      }

      normalized.push({ start, end });
    }
  }

  if (seen.size !== 7) {
    return errorResponse("Необходимо указать каждый день недели.", 400);
  }

  try {
    if (!(await checkStudio(config.url, config.key, studioId))) {
      return errorResponse("Клуб не найден или отключён.", 404);
    }

    const scheduleUrl = new URL(`${config.url}/rest/v1/studio_weekly_schedule`);
    scheduleUrl.searchParams.set("on_conflict", "studio_id,weekday");

    const scheduleResponse = await fetch(scheduleUrl, {
      method: "POST",
      headers: {
        ...headers(config.key),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(
        (days as DayInput[]).map((day) => ({
          studio_id: studioId,
          weekday: day.weekday,
          is_open: day.is_open,
        }))
      ),
      cache: "no-store",
    });

    if (!scheduleResponse.ok) {
      console.error("Weekly schedule save failed:", scheduleResponse.status, await scheduleResponse.text());
      return errorResponse("Не удалось сохранить дни расписания.", 503);
    }

    const savedSchedules = await scheduleResponse.json();

    for (const schedule of savedSchedules as Array<{ id: string; weekday: number }>) {
      const day = (days as DayInput[]).find(
        (item) => item.weekday === schedule.weekday
      );

      if (!day) continue;

      const deleteUrl = new URL(`${config.url}/rest/v1/studio_weekly_schedule_intervals`);
      deleteUrl.searchParams.set("schedule_id", `eq.${schedule.id}`);

      const deleteResponse = await fetch(deleteUrl, {
        method: "DELETE",
        headers: headers(config.key),
        cache: "no-store",
      });

      if (!deleteResponse.ok) {
        console.error("Weekly intervals delete failed:", deleteResponse.status, await deleteResponse.text());
        return errorResponse("Не удалось обновить рабочие интервалы.", 503);
      }

      if (day.is_open && day.intervals.length > 0) {
        const insertResponse = await fetch(
          `${config.url}/rest/v1/studio_weekly_schedule_intervals`,
          {
            method: "POST",
            headers: {
              ...headers(config.key),
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify(
              day.intervals.map((interval) => ({
                schedule_id: schedule.id,
                opens_at: interval.opens_at.length === 5
                  ? `${interval.opens_at}:00`
                  : interval.opens_at,
                closes_at: interval.closes_at.length === 5
                  ? `${interval.closes_at}:00`
                  : interval.closes_at,
              }))
            ),
            cache: "no-store",
          }
        );

        if (!insertResponse.ok) {
          console.error("Weekly intervals insert failed:", insertResponse.status, await insertResponse.text());
          return errorResponse("Не удалось сохранить рабочие интервалы.", 503);
        }
      }
    }

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Weekly schedule PUT error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Ошибка сохранения расписания.",
      503
    );
  }
}
