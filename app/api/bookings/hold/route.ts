
import { NextRequest, NextResponse } from "next/server";
import { GET as getAvailability } from "@/app/api/availability/route";
import {
  consumeApiRateLimit,
  createInternalAvailabilityToken,
} from "@/lib/api-rate-limit";
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
      `Booking hold query failed (${table}). HTTP status:`,
      response.status,
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
  // Групповые бронирования очищаются одной PostgreSQL-функцией.
  // Она атомарно переводит payment_groups в cancelled и связанные
  // неоплаченные бронирования в expired.
  // Группы с начатой инициализацией платежа не затрагиваются.
  const groupedResponse = await fetch(
    `${url}/rest/v1/rpc/expire_unpaid_payment_holds`,
    {
      method: "POST",
      headers: {
        ...headers(key),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      cache: "no-store",
    },
  );

  if (!groupedResponse.ok) {
    console.error(
      "Expired grouped payment cleanup failed. HTTP status:",
      groupedResponse.status,
    );

    throw new Error(
      "Не удалось освободить истёкшие групповые бронирования. Повторите попытку.",
    );
  }

  // Совместимость со старыми бронями без payment_group_id.
  // Не трогаем их, если для них уже начиналась инициализация оплаты.
  const legacyUrl = new URL(`${url}/rest/v1/bookings`);
  legacyUrl.searchParams.set("status", "eq.pending_payment");
  legacyUrl.searchParams.set("hold_expires_at", `lte.${nowIso}`);
  legacyUrl.searchParams.set("payment_group_id", "is.null");
  legacyUrl.searchParams.set("payment_init_started_at", "is.null");
  legacyUrl.searchParams.set("payment_id", "is.null");

  const legacyResponse = await fetch(legacyUrl, {
    method: "PATCH",
    headers: {
      ...headers(key),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ status: "expired" }),
    cache: "no-store",
  });

  if (!legacyResponse.ok) {
    console.error(
      "Expired legacy booking cleanup failed. HTTP status:",
      legacyResponse.status,
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
        (item.duration_minutes as number) < 60 ||
        (item.duration_minutes as number) > 480 ||
        (item.duration_minutes as number) % 60 !== 0
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
    (data.duration_minutes as number) >= 60 &&
    (data.duration_minutes as number) <= 480 &&
    (data.duration_minutes as number) % 60 === 0
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

    // Ограничиваем создание резервов по подтверждённому ID пользователя.
    const rateLimit = await consumeApiRateLimit({
      supabaseUrl: config.url,
      serviceKey: config.key,
      routeKey: "booking_hold",
      subject: userId,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Слишком много попыток бронирования. Подождите немного и повторите попытку." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(rateLimit.retryAfterSeconds),
            "X-RateLimit-Limit": "5",
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }

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
        select: "hold_minutes",
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

    for (const group of groups) {
      if (
        group.duration_minutes < 60 ||
        group.duration_minutes > 480 ||
        group.duration_minutes % 60 !== 0
      ) {
        return errorResponse(
          "Бронирование должно состоять из целого количества часовых слотов.",
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

    // Проверяем каждый час отдельно. В БД создаётся одна бронь на выбранную
    // группу соседних часов, а цена суммируется по часовым тарифам.
    const validated: Array<{
      table_id: string;
      start_at: string;
      end_at: string;
      price_rub: number;
    }> = [];

    for (const group of groups) {
      const groupStartMs = Date.parse(group.start_at);
      const hours = group.duration_minutes / 60;
      let totalPrice = 0;
      let firstStartAt = "";
      let finalEndAt = "";

      for (let index = 0; index < hours; index++) {
        const segmentStart = new Date(
          groupStartMs + index * 60 * 60_000,
        );

        const availabilityUrl = new URL(
          "/api/availability",
          request.url,
        );

        availabilityUrl.searchParams.set("studio_id", studioId);
        availabilityUrl.searchParams.set("date", date);
        availabilityUrl.searchParams.set("duration_minutes", "60");

        // Внутренний вызов подписан серверным токеном и не расходует
        // публичный лимит запросов календаря.
        const availabilityResponse = await getAvailability(
          new NextRequest(availabilityUrl, {
            headers: {
              "x-ponglab-internal-availability":
                createInternalAvailabilityToken(config.key),
            },
          }),
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

        const slot = slots.find(
          (candidate) =>
            Date.parse(candidate.start_at) === segmentStart.getTime() &&
            Number(candidate.duration_minutes) === 60 &&
            candidate.available_tables.some(
              (table) => table.id === group.table_id,
            ),
        );

        if (!slot) {
          console.error("Booking hold hourly segment is no longer available.");

          return errorResponse(
            "Один из выбранных часовых слотов уже недоступен или тариф изменился. Обновите календарь.",
            409,
          );
        }

        if (index === 0) {
          firstStartAt = slot.start_at;
        }

        finalEndAt = slot.end_at;
        totalPrice += Number(slot.price_rub);
      }

      validated.push({
        table_id: group.table_id,
        start_at: firstStartAt,
        end_at: finalEndAt,
        price_rub: totalPrice,
      });
    }

    const holdExpiresAt = new Date(
      Date.now() + holdMinutes * 60_000,
    ).toISOString();

    // Создаём группу платежа и все связанные брони одной транзакцией PostgreSQL.
    // Платёжный провайдер — YooKassa. Сам платёж подключим следующим этапом.
    const rpcResponse = await fetch(
      `${config.url}/rest/v1/rpc/create_payment_group_with_bookings`,
      {
        method: "POST",
        headers: {
          ...headers(config.key),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          p_user_id: userId,
          p_provider: "yookassa",
          p_hold_expires_at: holdExpiresAt,
          p_bookings: validated.map((item) => ({
            table_id: item.table_id,
            start_at: item.start_at,
            end_at: item.end_at,
            price_rub: item.price_rub,
          })),
        }),
        cache: "no-store",
      },
    );

    if (!rpcResponse.ok) {
      const details = await rpcResponse.text();

      console.error(
        "Atomic payment group creation failed. HTTP status:",
        rpcResponse.status,
      );

      if (
        rpcResponse.status === 409 ||
        details.includes("bookings_no_overlap") ||
        details.includes("23P01")
      ) {
        return errorResponse(
          "Кто-то успел занять один из выбранных периодов. Обновите календарь и выберите другое время.",
          409,
        );
      }

      return errorResponse(
        "Не удалось создать группу бронирования. Повторите попытку.",
        503,
      );
    }

    const createdGroup = await rpcResponse.json().catch(() => null);

    if (
      !createdGroup ||
      typeof createdGroup !== "object" ||
      !createdGroup.payment_group_id ||
      !Array.isArray(createdGroup.bookings) ||
      createdGroup.bookings.length !== validated.length ||
      Number(createdGroup.total_price_rub) <= 0
    ) {
      console.error(
        "Atomic payment group creation returned an unexpected response.",
        {
          hasPaymentGroupId: Boolean(createdGroup?.payment_group_id),
          bookingsIsArray: Array.isArray(createdGroup?.bookings),
          bookingCount: Array.isArray(createdGroup?.bookings)
            ? createdGroup.bookings.length
            : null,
          hasPositiveTotal:
            Number.isFinite(Number(createdGroup?.total_price_rub)) &&
            Number(createdGroup.total_price_rub) > 0,
        },
      );

      return errorResponse(
        "Сервер не подтвердил создание всей группы бронирования.",
        503,
      );
    }

    const bookings = createdGroup.bookings.map((row: {
      id: string;
      start_at: string;
      end_at: string;
      price_rub: number;
      status: string;
      hold_expires_at: string;
      table_id: string;
    }) => ({
      id: row.id,
      start_at: row.start_at,
      end_at: row.end_at,
      price_rub: row.price_rub,
      status: row.status,
      hold_expires_at: row.hold_expires_at,
      table_id: row.table_id,
    }));

    return NextResponse.json(
      {
        payment_group_id: createdGroup.payment_group_id,
        bookings,
        total_price_rub: Number(createdGroup.total_price_rub),
        hold_expires_at: createdGroup.hold_expires_at ?? holdExpiresAt,
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
  } catch {
    console.error("Booking hold POST failed.");

    return errorResponse(
      "Не удалось создать временную бронь. Попробуйте позже.",
      503,
    );
  }
}
