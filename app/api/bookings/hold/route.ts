
import { NextRequest, NextResponse } from "next/server";
import { GET as getAvailability } from "@/app/api/availability/route";
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

type RequestedGroup = {
  table_id: string;
  start_at: string;
  duration_minutes: number;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function headers(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

async function readRows(
  url: string,
  key: string,
  table: string,
  params: Record<string, string>,
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
      `Booking hold query failed (${table}):`,
      response.status,
      await response.text(),
    );

    throw new Error("Не удалось проверить данные бронирования.");
  }

  return response.json();
}

async function expireOldHolds(
  url: string,
  key: string,
  nowIso: string,
) {
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
    console.error(
      "Expired booking holds cleanup failed:",
      response.status,
      await response.text(),
    );

    throw new Error(
      "Не удалось освободить истёкшие бронирования. Повторите попытку.",
    );
  }
}

function parseRequestedGroups(
  data: Record<string, unknown>,
): {
  groups: RequestedGroup[];
  legacySingleGroup: boolean;
} | null {
  // Новый формат: массив отдельных групп бронирования.
  if (Array.isArray(data.groups)) {
    if (data.groups.length < 1 || data.groups.length > 10) {
      return null;
    }

    const groups: RequestedGroup[] = [];

    for (const raw of data.groups) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return null;
      }

      const item = raw as Record<string, unknown>;

      if (
        !isUuid(item.table_id) ||
        typeof item.start_at !== "string" ||
        !Number.isFinite(Date.parse(item.start_at)) ||
        !Number.isInteger(item.duration_minutes) ||
        (item.duration_minutes as number) < 15 ||
        (item.duration_minutes as number) > 480 ||
        (item.duration_minutes as number) % 5 !== 0
      ) {
        return null;
      }

      groups.push({
        table_id: item.table_id,
        start_at: new Date(item.start_at).toISOString(),
        duration_minutes: item.duration_minutes as number,
      });
    }

    return {
      groups,
      legacySingleGroup: false,
    };
  }

  // Старый формат оставлен для совместимости с одиночной бронью.
  if (
    isUuid(data.table_id) &&
    typeof data.start_at === "string" &&
    Number.isFinite(Date.parse(data.start_at)) &&
    Number.isInteger(data.duration_minutes) &&
    (data.duration_minutes as number) >= 15 &&
    (data.duration_minutes as number) <= 480 &&
    (data.duration_minutes as number) % 5 === 0
  ) {
    return {
      groups: [
        {
          table_id: data.table_id,
          start_at: new Date(data.start_at).toISOString(),
          duration_minutes: data.duration_minutes as number,
        },
      ],
      legacySingleGroup: true,
    };
  }

  return null;
}

export async function POST(request: NextRequest) {
  console.log("[PONGLAB_HOLD] POST reached", {
  path: new URL(request.url).pathname,
  origin: request.headers.get("origin"),
  environment: process.env.VERCEL_ENV ?? "local",
});
  // Не принимаем запросы с посторонних сайтов.
  const origin = request.headers.get("origin");

  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("Недопустимый запрос.", 403);
  }

  const sessionToken = request.cookies.get("ponglab_session")?.value;

  if (!sessionToken || !/^[a-f0-9]{64}$/i.test(sessionToken)) {
    return errorResponse(
      "Сначала войдите в личный кабинет и подтвердите номер телефона.",
      401,
    );
  }

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

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Некорректный запрос.", 400);
  }

  const data = body as Record<string, unknown>;
  const studioId = data.studio_id;
  const date = data.date;
  const parsedGroups = parseRequestedGroups(data);

  if (!isUuid(studioId)) {
    return errorResponse("Не удалось определить клуб.", 400);
  }

  if (!isValidDate(date)) {
    return errorResponse("Укажите корректную дату бронирования.", 400);
  }

  if (!parsedGroups) {
    return errorResponse(
      "Переданы некорректные слоты. Обновите календарь и попробуйте снова.",
      400,
    );
  }

  const groups = parsedGroups.groups;

  // Не принимаем пересекающиеся периоды на одном столе.
  for (let i = 0; i < groups.length; i++) {
    const a = groups[i];
    const aStart = Date.parse(a.start_at);
    const aEnd = aStart + a.duration_minutes * 60_000;

    for (let j = i + 1; j < groups.length; j++) {
      const b = groups[j];

      if (a.table_id !== b.table_id) {
        continue;
      }

      const bStart = Date.parse(b.start_at);
      const bEnd = bStart + b.duration_minutes * 60_000;

      if (aStart < bEnd && bStart < aEnd) {
        return errorResponse(
          "Выбраны пересекающиеся периоды для одного стола.",
          400,
        );
      }
    }
  }

  const tokenHash = createHash("sha256")
    .update(sessionToken)
    .digest("hex");

  try {
    // Получаем пользователя исключительно по действующей серверной сессии.
    const sessions = await readRows(
      config.url,
      config.key,
      "user_sessions",
      {
        select: "user_id",
        token_hash: `eq.${tokenHash}`,
        expires_at: `gt.${new Date().toISOString()}`,
        limit: "1",
      },
    );

    if (!Array.isArray(sessions) || !sessions[0]?.user_id) {
      return errorResponse(
        "Сессия истекла. Войдите в личный кабинет повторно.",
        401,
      );
    }

    const userId = sessions[0].user_id as string;

    // Освобождаем истёкшие удержания.
    await expireOldHolds(
      config.url,
      config.key,
      new Date().toISOString(),
    );

    // Читаем разрешённые длительности и время удержания.
    const settingsRows = await readRows(
      config.url,
      config.key,
      "studio_booking_settings",
      {
        select: "hold_minutes,allowed_durations_minutes",
        studio_id: `eq.${studioId}`,
        limit: "1",
      },
    );

    const settings = Array.isArray(settingsRows)
      ? settingsRows[0]
      : null;

    if (!settings) {
      return errorResponse(
        "Настройки бронирования клуба не найдены.",
        409,
      );
    }

    const allowedDurations = Array.isArray(
      settings.allowed_durations_minutes,
    )
      ? settings.allowed_durations_minutes.map(Number)
      : [];

    for (const group of groups) {
      if (!allowedDurations.includes(group.duration_minutes)) {
        return errorResponse(
          `Длительность ${group.duration_minutes} минут не разрешена настройками клуба. Выберите доступную длительность.`,
          400,
        );
      }
    }

    const holdMinutes = Number(settings.hold_minutes);

    if (
      !Number.isInteger(holdMinutes) ||
      holdMinutes < 1 ||
      holdMinutes > 60
    ) {
      return errorResponse(
        "У клуба некорректно настроено время удержания брони.",
        503,
      );
    }

    // Проверяем каждую группу через серверный календарь.
    // Цена и время окончания берутся из серверного ответа.
    const validated: Array<{
      table_id: string;
      start_at: string;
      end_at: string;
      price_rub: number;
    }> = [];

    for (const group of groups) {
      const availabilityUrl = new URL(
        "/api/availability",
        request.url,
      );

      availabilityUrl.searchParams.set("studio_id", studioId);
      availabilityUrl.searchParams.set("date", date);
      availabilityUrl.searchParams.set(
        "duration_minutes",
        String(group.duration_minutes),
      );

      // Вызываем обработчик доступности напрямую внутри сервера.
      // Так запрос не зависит от домена Vercel и не попадает на HTML-страницу
      // защиты preview-деплоя вместо JSON API-ответа.
      const availabilityResponse = await getAvailability(
        new NextRequest(availabilityUrl),
      );
      const availabilityData = await availabilityResponse
        .json()
        .catch(() => ({}));

      if (!availabilityResponse.ok) {
        return errorResponse(
          availabilityData.error ||
            "Не удалось проверить доступность слота.",
          availabilityResponse.status,
        );
      }

      const slots = Array.isArray(availabilityData.slots)
        ? (availabilityData.slots as AvailableSlot[])
        : [];

      // Сравниваем время по миллисекундам, а не по строковому представлению.
      const requestedStartMs = Date.parse(group.start_at);

      const slot = slots.find(
        (candidate) =>
          Date.parse(candidate.start_at) === requestedStartMs &&
          Number(candidate.duration_minutes) === group.duration_minutes &&
          candidate.available_tables.some(
            (table) => table.id === group.table_id,
          ),
      );

      if (!slot) {
        console.error("Booking hold slot mismatch:", {
          studioId,
          date,
          requested: {
            start_at: group.start_at,
            duration_minutes: group.duration_minutes,
            table_id: group.table_id,
          },
          serverSlots: slots.map((candidate) => ({
            start_at: candidate.start_at,
            duration_minutes: candidate.duration_minutes,
            price_rub: candidate.price_rub,
            available_table_ids: candidate.available_tables.map(
              (table) => table.id,
            ),
          })),
        });

        return errorResponse(
          "Один из выбранных периодов уже недоступен или тариф изменился. Обновите календарь.",
          409,
        );
      }

      validated.push({
        table_id: group.table_id,
        start_at: slot.start_at,
        end_at: slot.end_at,
        price_rub: Number(slot.price_rub),
      });
    }

    const holdExpiresAt = new Date(
      Date.now() + holdMinutes * 60_000,
    ).toISOString();

    // Создаём все брони одним пакетным запросом.
    // Ограничения базы данных должны отклонять пересечения по времени.
    const rowsToInsert = validated.map((item) => ({
      user_id: userId,
      table_id: item.table_id,
      start_at: item.start_at,
      end_at: item.end_at,
      price_rub: item.price_rub,
      status: "pending_payment",
      payment_provider: "tbank",
      payment_status: "pending",
      hold_expires_at: holdExpiresAt,
    }));

    const insertResponse = await fetch(
      `${config.url}/rest/v1/bookings`,
      {
        method: "POST",
        headers: {
          ...headers(config.key),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(rowsToInsert),
        cache: "no-store",
      },
    );

    if (!insertResponse.ok) {
      const details = await insertResponse.text();

      console.error(
        "Booking hold insert failed:",
        insertResponse.status,
        details,
      );

      if (
        insertResponse.status === 409 ||
        details.includes("bookings_no_overlap") ||
        details.includes("23P01")
      ) {
        return errorResponse(
          "Кто-то успел занять один из выбранных периодов. Обновите календарь и выберите другое время.",
          409,
        );
      }

      if (details.includes("bookings_payment_provider_check")) {
        return errorResponse(
          "База данных ещё не обновлена для выбранного платёжного провайдера. Проверьте SQL-миграцию.",
          503,
        );
      }

      return errorResponse(
        "Не удалось создать временную бронь. Повторите попытку.",
        503,
      );
    }

    const createdRows = await insertResponse.json();

    if (
      !Array.isArray(createdRows) ||
      createdRows.length !== rowsToInsert.length ||
      createdRows.some((row) => !row?.id)
    ) {
      console.error(
        "Booking hold insert returned an unexpected response.",
        createdRows,
      );

      return errorResponse(
        "Сервер не подтвердил создание всех временных броней.",
        503,
      );
    }

    const bookings = createdRows.map((row) => ({
      id: row.id,
      start_at: row.start_at,
      end_at: row.end_at,
      price_rub: row.price_rub,
      status: row.status,
      hold_expires_at: row.hold_expires_at,
      table_id: row.table_id,
    }));

    const totalPrice = bookings.reduce(
      (total, booking) => total + Number(booking.price_rub),
      0,
    );

    return NextResponse.json(
      {
        bookings,
        total_price_rub: totalPrice,
        hold_expires_at: holdExpiresAt,
        next_step: "payment",
        ...(parsedGroups.legacySingleGroup
          ? { booking: bookings[0] }
          : {}),
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Booking hold POST error:", error);

    return errorResponse(
      error instanceof Error
        ? error.message
        : "Не удалось создать временную бронь.",
      503,
    );
  }
}
