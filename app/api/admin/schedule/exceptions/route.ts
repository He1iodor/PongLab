
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/app/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
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
    console.error(
      "Exception studio check failed:",
      response.status,
      await response.text()
    );

    throw new Error("Не удалось проверить клуб.");
  }

  const rows = await response.json();

  return Array.isArray(rows) && rows.length > 0;
}

export async function GET(request: NextRequest) {
  const access = await requireOwner(request);
  if (!access.ok) return access.response;

  const config = getConfig();

  if (!config) {
    return errorResponse("Сервис временно недоступен.", 503);
  }

  const studioId = request.nextUrl.searchParams.get("studio_id");

  if (!studioId || !isUuid(studioId)) {
    return errorResponse("Укажите корректный клуб.", 400);
  }

  try {
    if (!(await checkStudio(config.url, config.key, studioId))) {
      return errorResponse("Клуб не найден или отключён.", 404);
    }

    const target = new URL(
      `${config.url}/rest/v1/studio_date_exceptions`
    );

    target.searchParams.set(
      "select",
      "id,studio_id,exception_date,is_closed,note"
    );
    target.searchParams.set("studio_id", `eq.${studioId}`);
    target.searchParams.set("order", "exception_date.asc");

    const response = await fetch(target, {
      headers: headers(config.key),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        "Exceptions GET failed:",
        response.status,
        await response.text()
      );

      return errorResponse(
        "Не удалось загрузить исключения.",
        503
      );
    }

    const exceptions = await response.json();

    const ids = exceptions.map(
      (item: { id: string }) => item.id
    );

    let intervals: Array<{
      id: string;
      exception_id: string;
      opens_at: string;
      closes_at: string;
    }> = [];

    if (ids.length > 0) {
      const intervalUrl = new URL(
        `${config.url}/rest/v1/studio_date_exception_intervals`
      );

      intervalUrl.searchParams.set(
        "select",
        "id,exception_id,opens_at,closes_at"
      );

      intervalUrl.searchParams.set(
        "exception_id",
        `in.(${ids.join(",")})`
      );

      intervalUrl.searchParams.set(
        "order",
        "opens_at.asc"
      );

      const intervalResponse = await fetch(intervalUrl, {
        headers: headers(config.key),
        cache: "no-store",
      });

      if (!intervalResponse.ok) {
        console.error(
          "Exception intervals GET failed:",
          intervalResponse.status,
          await intervalResponse.text()
        );

        return errorResponse(
          "Не удалось загрузить интервалы исключений.",
          503
        );
      }

      intervals = await intervalResponse.json();
    }

    const result = exceptions.map((item: {
      id: string;
      studio_id: string;
      exception_date: string;
      is_closed: boolean;
      note: string | null;
    }) => ({
      ...item,
      intervals: intervals
        .filter(
          (interval) => interval.exception_id === item.id
        )
        .map((interval) => ({
          opens_at: interval.opens_at,
          closes_at: interval.closes_at,
        })),
    }));

    return NextResponse.json(
      { exceptions: result },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Exceptions GET error:", error);

    return errorResponse(
      error instanceof Error
        ? error.message
        : "Ошибка загрузки исключений.",
      503
    );
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("Недопустимый запрос.", 403);
  }

  const access = await requireOwner(request);
  if (!access.ok) return access.response;

  const config = getConfig();

  if (!config) {
    return errorResponse("Сервис временно недоступен.", 503);
  }

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
  const date = data.exception_date;
  const isClosed = data.is_closed;
  const note = data.note;
  const intervals = data.intervals;

  if (typeof studioId !== "string" || !isUuid(studioId)) {
    return errorResponse("Выберите клуб.", 400);
  }

  if (!validDate(date)) {
    return errorResponse("Укажите корректную дату.", 400);
  }

  if (typeof isClosed !== "boolean") {
    return errorResponse("Укажите тип исключения.", 400);
  }

  if (
    note !== undefined &&
    note !== null &&
    (
      typeof note !== "string" ||
      note.trim().length > 300
    )
  ) {
    return errorResponse(
      "Примечание должно быть не длиннее 300 символов.",
      400
    );
  }

  if (!Array.isArray(intervals) || intervals.length > 10) {
    return errorResponse(
      "Укажите до 10 рабочих интервалов.",
      400
    );
  }

  if (isClosed && intervals.length > 0) {
    return errorResponse(
      "Для закрытого дня интервалы не нужны.",
      400
    );
  }

  const normalized: Array<{
    opens_at: string;
    closes_at: string;
    start: number;
    end: number;
  }> = [];

  for (const item of intervals as Array<Record<string, unknown>>) {
    if (
      !item ||
      typeof item.opens_at !== "string" ||
      typeof item.closes_at !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(item.opens_at) ||
      !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(item.closes_at)
    ) {
      return errorResponse(
        "Укажите корректное время интервалов.",
        400
      );
    }

    const toMinutes = (value: string) => {
      const [hours, minutes] = value.split(":").map(Number);
      return hours * 60 + minutes;
    };

    const start = toMinutes(item.opens_at);
    const end = toMinutes(item.closes_at);

    if (start >= end) {
      return errorResponse(
        "Окончание должно быть позже начала.",
        400
      );
    }

    if (
      normalized.some(
        (other) => start < other.end && end > other.start
      )
    ) {
      return errorResponse(
        "Интервалы не должны пересекаться.",
        400
      );
    }

    normalized.push({
      opens_at: item.opens_at.length === 5
        ? `${item.opens_at}:00`
        : item.opens_at,

      closes_at: item.closes_at.length === 5
        ? `${item.closes_at}:00`
        : item.closes_at,

      start,
      end,
    });
  }

  if (!isClosed && normalized.length === 0) {
    return errorResponse(
      "Для особого рабочего дня добавьте хотя бы один интервал.",
      400
    );
  }

  try {
    if (!(await checkStudio(config.url, config.key, studioId))) {
      return errorResponse("Клуб не найден или отключён.", 404);
    }

    const saveResponse = await fetch(
      `${config.url}/rest/v1/rpc/save_date_exception_atomic`,
      {
        method: "POST",
        headers: {
          ...headers(config.key),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_studio_id: studioId,
          p_exception_date: date,
          p_is_closed: isClosed,
          p_note: typeof note === "string"
            ? note.trim() || null
            : null,

          p_intervals: normalized.map((interval) => ({
            opens_at: interval.opens_at,
            closes_at: interval.closes_at,
          })),
        }),
        cache: "no-store",
      }
    );

    if (!saveResponse.ok) {
      console.error(
        "Exception atomic save failed:",
        saveResponse.status,
        await saveResponse.text()
      );

      return errorResponse(
        "Не удалось сохранить исключение.",
        503
      );
    }

    const exception = await saveResponse.json();

    if (!exception || typeof exception !== "object") {
      return errorResponse(
        "Не удалось подтвердить сохранение исключения.",
        503
      );
    }

    return NextResponse.json(
      { exception },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Exceptions POST error:", error);

    return errorResponse(
      error instanceof Error
        ? error.message
        : "Ошибка сохранения исключения.",
      503
    );
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("Недопустимый запрос.", 403);
  }

  const access = await requireOwner(request);
  if (!access.ok) return access.response;

  const config = getConfig();

  if (!config) {
    return errorResponse("Сервис временно недоступен.", 503);
  }

  const id = request.nextUrl.searchParams.get("id");

  if (!id || !isUuid(id)) {
    return errorResponse("Укажите корректное исключение.", 400);
  }

  try {
    const target = new URL(
      `${config.url}/rest/v1/studio_date_exceptions`
    );

    target.searchParams.set("id", `eq.${id}`);

    const response = await fetch(target, {
      method: "DELETE",
      headers: headers(config.key),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        "Exception DELETE failed:",
        response.status,
        await response.text()
      );

      return errorResponse(
        "Не удалось удалить исключение.",
        503
      );
    }

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Exception DELETE error:", error);

    return errorResponse(
      error instanceof Error
        ? error.message
        : "Ошибка удаления исключения.",
      503
    );
  }
}
