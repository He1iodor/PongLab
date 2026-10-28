import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/app/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingRow = {
  id: string;
  user_id: string;
  table_id: string;
  start_at: string;
  end_at: string;
  status: string;
  payment_status: string;
  price_rub: number;
  payment_provider: string | null;
  payment_id: string | null;
  payment_init_started_at: string | null;
  hold_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type TableRow = {
  id: string;
  name: string;
  studio_id: string;
};

type StudioRow = {
  id: string;
  name: string;
  address: string | null;
  timezone: string | null;
};

type UserRow = {
  id: string;
  phone: string | null;
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

function apiHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

async function getRows<T>(
  url: string,
  key: string,
  table: string,
  params: Record<string, string>,
): Promise<T[]> {
  const target = new URL(`${url}/rest/v1/${table}`);

  for (const [name, value] of Object.entries(params)) {
    target.searchParams.set(name, value);
  }

  const response = await fetch(target, {
    headers: apiHeaders(key),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();

    console.error(
      `Admin bookings query failed (${table}):`,
      response.status,
      details,
    );

    throw new Error("Не удалось загрузить данные бронирований.");
  }

  const rows: unknown = await response.json();

  if (!Array.isArray(rows)) {
    throw new Error("Сервер вернул некорректные данные.");
  }

  return rows as T[];
}

function buildInFilter(ids: string[]) {
  return `in.(${ids.join(",")})`;
}

/**
 * GET /api/admin/bookings
 *
 * Возвращает бронирования для владельца.
 * Можно передать studio_id, чтобы получить брони конкретного клуба.
 */
export async function GET(request: NextRequest) {
  const access = await requireOwner(request);

  if (!access.ok) {
    return access.response;
  }

  const config = getConfig();

  if (!config) {
    return errorResponse("Сервис временно недоступен.", 503);
  }

  const studioId = request.nextUrl.searchParams.get("studio_id");

  if (studioId && studioId !== "all" && !isUuid(studioId)) {
    return errorResponse("Указан некорректный клуб.", 400);
  }

  try {
    const tableParams: Record<string, string> = {
      select: "id,name,studio_id",
      order: "name.asc",
      limit: "2000",
    };

    if (studioId && studioId !== "all") {
      tableParams.studio_id = `eq.${studioId}`;
    }

    const tables = await getRows<TableRow>(
      config.url,
      config.key,
      "studio_tables",
      tableParams,
    );

    const tableIds = tables.map((table) => table.id);

    if (studioId && studioId !== "all" && tableIds.length === 0) {
      return NextResponse.json(
        { bookings: [], limit: 500 },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const bookingParams: Record<string, string> = {
      select:
        "id,user_id,table_id,start_at,end_at,status,payment_status,price_rub,payment_provider,payment_id,payment_init_started_at,hold_expires_at,created_at,updated_at",
      order: "created_at.desc",
      limit: "500",
    };

    if (studioId && studioId !== "all") {
      bookingParams.table_id = buildInFilter(tableIds);
    }

    const bookingRows = await getRows<BookingRow>(
      config.url,
      config.key,
      "bookings",
      bookingParams,
    );

    const selectedTableIds = new Set(tableIds);

    const relevantBookings =
      studioId && studioId !== "all"
        ? bookingRows.filter((booking) =>
            selectedTableIds.has(booking.table_id),
          )
        : bookingRows;

    const tableMap = new Map(
      tables.map((table) => [table.id, table]),
    );

    const studioIds = [
      ...new Set(tables.map((table) => table.studio_id)),
    ];

    const userIds = [
      ...new Set(relevantBookings.map((booking) => booking.user_id)),
    ];

    const [studios, users] = await Promise.all([
      studioIds.length
        ? getRows<StudioRow>(
            config.url,
            config.key,
            "studios",
            {
              select: "id,name,address,timezone",
              id: buildInFilter(studioIds),
              limit: "2000",
            },
          )
        : Promise.resolve([] as StudioRow[]),

      userIds.length
        ? getRows<UserRow>(
            config.url,
            config.key,
            "users",
            {
              select: "id,phone",
              id: buildInFilter(userIds),
              limit: "2000",
            },
          )
        : Promise.resolve([] as UserRow[]),
    ]);

    const studioMap = new Map(
      studios.map((studio) => [studio.id, studio]),
    );

    const userMap = new Map(
      users.map((user) => [user.id, user]),
    );

    const now = Date.now();

    const bookings = relevantBookings.map((booking) => {
      const table = tableMap.get(booking.table_id);

      const studio = table
        ? studioMap.get(table.studio_id)
        : undefined;

      const user = userMap.get(booking.user_id);

      const holdDeadline = booking.hold_expires_at
        ? Date.parse(booking.hold_expires_at)
        : Number.NaN;

      // Истёкшим считаем только неоплаченный резерв,
      // для которого платёжная операция ещё не начиналась.
      const isExpiredHold =
        booking.status === "pending_payment" &&
        booking.payment_status !== "succeeded" &&
        !booking.payment_id &&
        !booking.payment_init_started_at &&
        Number.isFinite(holdDeadline) &&
        holdDeadline <= now;

      return {
        id: booking.id,
        user_id: booking.user_id,

        client_phone: user?.phone ?? null,

        table_id: booking.table_id,
        table_name: table?.name ?? "Стол не найден",

        studio_id: table?.studio_id ?? null,
        studio_name: studio?.name ?? "Клуб не найден",
        studio_address: studio?.address ?? null,
        timezone: studio?.timezone ?? "Europe/Moscow",

        start_at: booking.start_at,
        end_at: booking.end_at,

        status: booking.status,
        effective_status: isExpiredHold
          ? "expired"
          : booking.status,

        payment_status: booking.payment_status,
        price_rub: Number(booking.price_rub),

        payment_provider: booking.payment_provider,
        hold_expires_at: booking.hold_expires_at,

        payment_started: Boolean(
          booking.payment_id ||
            booking.payment_init_started_at,
        ),

        created_at: booking.created_at,
        updated_at: booking.updated_at,
      };
    });

    return NextResponse.json(
      {
        bookings,
        limit: 500,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Admin bookings GET error:", error);

    return errorResponse(
      "Не удалось загрузить бронирования.",
      503,
    );
  }
}

/**
 * POST /api/admin/bookings
 *
 * Отмена только временного резерва без начатого платежа.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("Недопустимый запрос.", 403);
  }

  const access = await requireOwner(request);

  if (!access.ok) {
    return access.response;
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

  if (!body || typeof body !== "object") {
    return errorResponse("Некорректный запрос.", 400);
  }

  const data = body as Record<string, unknown>;

  if (
    data.action !== "cancel" ||
    !isUuid(data.booking_id)
  ) {
    return errorResponse("Укажите бронь для отмены.", 400);
  }

  try {
    const currentRows = await getRows<BookingRow>(
      config.url,
      config.key,
      "bookings",
      {
        select:
          "id,status,payment_status,payment_id,payment_init_started_at,user_id,table_id,start_at,end_at,price_rub,payment_provider,hold_expires_at,created_at,updated_at",
        id: `eq.${data.booking_id}`,
        limit: "1",
      },
    );

    const current = currentRows[0];

    if (!current) {
      return errorResponse("Бронь не найдена.", 404);
    }

    if (
      current.status !== "pending_payment" ||
      current.payment_status !== "pending" ||
      current.payment_id ||
      current.payment_init_started_at
    ) {
      return errorResponse(
        "Эту бронь нельзя отменить автоматически: платёж мог начаться или бронь уже подтверждена.",
        409,
      );
    }

    // Повторная проверка состояния в самом UPDATE защищает
    // от отмены брони, если она изменилась после чтения.
    const updateUrl = new URL(
      `${config.url}/rest/v1/bookings`,
    );

    updateUrl.searchParams.set(
      "id",
      `eq.${data.booking_id}`,
    );
    updateUrl.searchParams.set(
      "status",
      "eq.pending_payment",
    );
    updateUrl.searchParams.set(
      "payment_status",
      "eq.pending",
    );
    updateUrl.searchParams.set(
      "payment_id",
      "is.null",
    );
    updateUrl.searchParams.set(
      "payment_init_started_at",
      "is.null",
    );

    const updateResponse = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        ...apiHeaders(config.key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      }),
      cache: "no-store",
    });

    if (!updateResponse.ok) {
      console.error(
        "Admin booking cancel failed:",
        updateResponse.status,
        await updateResponse.text(),
      );

      return errorResponse("Не удалось отменить бронь.", 503);
    }

    const updatedRows: unknown =
      await updateResponse.json();

    if (
      !Array.isArray(updatedRows) ||
      updatedRows.length === 0
    ) {
      return errorResponse(
        "Состояние брони изменилось. Обновите список и попробуйте снова.",
        409,
      );
    }

    return NextResponse.json(
      {
        success: true,
        booking: updatedRows[0],
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Admin bookings POST error:", error);

    return errorResponse(
      "Не удалось отменить бронь.",
      503,
    );
  }
}
