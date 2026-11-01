
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionRow = {
  user_id: string;
};

type BookingRow = {
  id: string;
  table_id: string;
  start_at: string;
  end_at: string;
  status: string;
  payment_status: string;
};

type TableRow = {
  id: string;
  studio_id: string;
  is_active: boolean;
};

type StudioRow = {
  id: string;
  is_active: boolean;
};

type DeviceRow = {
  id: string;
  studio_id: string;
  device_type: string;
  status: string;
  token_hash: string;
};

type CommandRow = {
  id: string;
  status: string;
  expires_at: string;
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
  query: Record<string, string>,
): Promise<T[]> {
  const target = new URL(`${url}/rest/v1/${table}`);

  for (const [name, value] of Object.entries(query)) {
    target.searchParams.set(name, value);
  }

  const response = await fetch(target, {
    headers: apiHeaders(key),
    cache: "no-store",
  });

  if (!response.ok) {
    console.error(
      `Door unlock query failed (${table}):`,
      response.status,
      await response.text(),
    );

    throw new Error("Не удалось проверить данные доступа.");
  }

  const rows: unknown = await response.json();

  if (!Array.isArray(rows)) {
    throw new Error("Некорректный ответ базы данных.");
  }

  return rows as T[];
}

export async function POST(request: NextRequest) {
  // Запрещаем запросы с посторонних сайтов.
  const origin = request.headers.get("origin");

  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("Недопустимый запрос.", 403);
  }

  // Проверяем формат ID бронирования.
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
  const bookingId = data.booking_id;

  if (!isUuid(bookingId)) {
    return errorResponse("Укажите корректное бронирование.", 400);
  }

  // Проверяем пользовательскую сессию.
  const sessionToken = request.cookies.get("ponglab_session")?.value;

  if (!sessionToken || !/^[a-f0-9]{64}$/i.test(sessionToken)) {
    return errorResponse(
      "Войдите в личный кабинет.",
      401,
    );
  }

  const config = getConfig();

  if (!config) {
    return errorResponse("Сервис временно недоступен.", 503);
  }

  const now = new Date();
  const nowIso = now.toISOString();

  try {
    // 1. Получаем пользователя только из проверенной сессии.
    const sessions = await getRows<SessionRow>(
      config.url,
      config.key,
      "user_sessions",
      {
        select: "user_id",
        token_hash: `eq.${createHash("sha256")
          .update(sessionToken)
          .digest("hex")}`,
        expires_at: `gt.${nowIso}`,
        limit: "1",
      },
    );

    const userId = sessions[0]?.user_id;

    if (!userId) {
      const response = NextResponse.json(
        { error: "Сессия истекла. Войдите повторно." },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        },
      );

      response.cookies.set("ponglab_session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });

      return response;
    }

    // 2. Проверяем, что бронь принадлежит именно этому пользователю.
    const bookings = await getRows<BookingRow>(
      config.url,
      config.key,
      "bookings",
      {
        select:
          "id,table_id,start_at,end_at,status,payment_status",
        id: `eq.${bookingId}`,
        user_id: `eq.${userId}`,
        limit: "1",
      },
    );

    const booking = bookings[0];

    if (!booking) {
      return errorResponse("Бронирование не найдено.", 404);
    }

    // 3. Проверяем подтверждение и успешную оплату.
    if (
      booking.status !== "confirmed" ||
      booking.payment_status !== "succeeded"
    ) {
      return errorResponse(
        "Для открытия двери нужна оплаченная и подтверждённая бронь.",
        403,
      );
    }

    // 4. Проверяем фактическое время бронирования.
    const startAt = Date.parse(booking.start_at);
    const endAt = Date.parse(booking.end_at);

    if (
      !Number.isFinite(startAt) ||
      !Number.isFinite(endAt) ||
      startAt > now.getTime() ||
      endAt <= now.getTime()
    ) {
      return errorResponse(
        "Открытие двери доступно только во время бронирования.",
        403,
      );
    }

    // 5. Находим стол и клуб, к которым относится бронь.
    const tables = await getRows<TableRow>(
      config.url,
      config.key,
      "studio_tables",
      {
        select: "id,studio_id,is_active",
        id: `eq.${booking.table_id}`,
        limit: "1",
      },
    );

    const table = tables[0];

    if (!table || !table.is_active) {
      return errorResponse(
        "Стол не найден или отключён.",
        403,
      );
    }

    const studios = await getRows<StudioRow>(
      config.url,
      config.key,
      "studios",
      {
        select: "id,is_active",
        id: `eq.${table.studio_id}`,
        is_active: "eq.true",
        limit: "1",
      },
    );

    if (!studios[0]) {
      return errorResponse(
        "Клуб не найден или отключён.",
        403,
      );
    }

    // 6. Ищем активный дверной контроллер всего клуба.
    const devices = await getRows<DeviceRow>(
      config.url,
      config.key,
      "access_devices",
      {
        select: "id,studio_id,device_type,status,token_hash",
        studio_id: `eq.${table.studio_id}`,
        device_type: "eq.door",
        status: "eq.active",
        limit: "2",
      },
    );

    if (devices.length === 0) {
      return errorResponse(
        "В клубе не зарегистрирован активный контроллер двери.",
        409,
      );
    }

    if (devices.length !== 1) {
      return errorResponse(
        "Ошибка конфигурации: у клуба несколько дверных контроллеров.",
        409,
      );
    }

    const device = devices[0];

    if (!device.token_hash) {
      return errorResponse(
        "У контроллера отсутствует секретный ключ.",
        409,
      );
    }

    // 7. Освобождаем просроченные команды этого устройства.
    // Это позволяет создать новую команду, если ESP32 не успела
    // получить предыдущую.
    const expireUrl = new URL(
      `${config.url}/rest/v1/device_commands`,
    );

    expireUrl.searchParams.set("device_id", `eq.${device.id}`);
    expireUrl.searchParams.set(
      "status",
      "in.(pending,claimed)",
    );
    expireUrl.searchParams.set(
      "expires_at",
      `lte.${nowIso}`,
    );

    const expireResponse = await fetch(expireUrl, {
      method: "PATCH",
      headers: {
        ...apiHeaders(config.key),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: "expired",
        result: "expired_before_execution",
      }),
      cache: "no-store",
    });

    if (!expireResponse.ok) {
      console.error(
        "Door command expiration failed:",
        expireResponse.status,
        await expireResponse.text(),
      );

      return errorResponse(
        "Не удалось проверить предыдущие команды.",
        503,
      );
    }

    // 8. Создаём короткоживущую команду открытия.
    const expiresAt = new Date(
      now.getTime() + 15_000,
    ).toISOString();

    const insertResponse = await fetch(
      `${config.url}/rest/v1/device_commands`,
      {
        method: "POST",
        headers: {
          ...apiHeaders(config.key),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          device_id: device.id,
          booking_id: booking.id,
          requested_by: userId,
          command: "unlock",
          status: "pending",
          expires_at: expiresAt,
        }),
        cache: "no-store",
      },
    );

    if (!insertResponse.ok) {
      const details = await insertResponse.text();

      // Уникальный индекс не позволит создать две активные
      // команды одному контроллеру одновременно.
      if (insertResponse.status === 409) {
        return errorResponse(
          "Для двери уже существует активная команда. Подождите несколько секунд.",
          409,
        );
      }

      console.error(
        "Door command insert failed:",
        insertResponse.status,
        details,
      );

      return errorResponse(
        "Не удалось создать команду открытия двери.",
        503,
      );
    }

    const commands: unknown = await insertResponse.json();

    const command = Array.isArray(commands)
      ? (commands[0] as CommandRow | undefined)
      : undefined;

    if (!command) {
      return errorResponse(
        "Не удалось подтвердить создание команды.",
        503,
      );
    }

    return NextResponse.json(
      {
        ok: true,
        command_id: command.id,
        status: command.status,
        expires_at: command.expires_at,
        message: "Команда открытия передана в очередь.",
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Door unlock request error:", error);

    return errorResponse(
      "Не удалось обработать запрос на открытие двери.",
      503,
    );
  }
}
