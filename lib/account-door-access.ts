
import { NextResponse } from "next/server";

export type DoorRequestChannel = "web" | "telegram";

type DoorAccessArgs = {
  userId: string;
  bookingId: string;
  requestChannel: DoorRequestChannel;
};

type SupabaseConfig = {
  url: string;
  key: string;
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

export type DoorAccessResult = {
  ok: true;
  command_id: string;
  status: string;
  expires_at: string;
  message: string;
};

export class DoorAccessError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DoorAccessError";
    this.status = status;
  }
}

function getConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new DoorAccessError(
      "Сервис временно недоступен.",
      503,
    );
  }

  return { url, key };
}

function apiHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

async function getRows<T>(
  config: SupabaseConfig,
  table: string,
  query: Record<string, string>,
): Promise<T[]> {
  const target = new URL(
    `${config.url}/rest/v1/${table}`,
  );

  for (const [name, value] of Object.entries(query)) {
    target.searchParams.set(name, value);
  }

  const response = await fetch(target, {
    headers: apiHeaders(config.key),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    console.error(
      `Door access query failed (${table}):`,
      response.status,
    );

    throw new Error("Не удалось проверить данные доступа.");
  }

  const rows: unknown = await response.json();

  if (!Array.isArray(rows)) {
    throw new Error("Некорректный ответ базы данных.");
  }

  return rows as T[];
}

export async function requestBookingDoorAccess(
  args: DoorAccessArgs,
): Promise<DoorAccessResult> {
  const config = getConfig();
  const now = new Date();
  const nowIso = now.toISOString();

  // 1. Проверяем, что бронирование принадлежит пользователю.
  const bookings = await getRows<BookingRow>(
    config,
    "bookings",
    {
      select:
        "id,table_id,start_at,end_at,status,payment_status",
      id: `eq.${args.bookingId}`,
      user_id: `eq.${args.userId}`,
      limit: "1",
    },
  );

  const booking = bookings[0];

  if (!booking) {
    throw new DoorAccessError(
      "Бронирование не найдено.",
      404,
    );
  }

  // 2. Проверяем подтверждение и успешную оплату.
  if (
    booking.status !== "confirmed" ||
    booking.payment_status !== "succeeded"
  ) {
    throw new DoorAccessError(
      "Для открытия двери нужна оплаченная и подтверждённая бронь.",
      403,
    );
  }

  // 3. Проверяем фактическое время бронирования.
  const startAt = Date.parse(booking.start_at);
  const endAt = Date.parse(booking.end_at);

  if (
    !Number.isFinite(startAt) ||
    !Number.isFinite(endAt) ||
    startAt > now.getTime() ||
    endAt <= now.getTime()
  ) {
    throw new DoorAccessError(
      "Открытие двери доступно только во время бронирования.",
      403,
    );
  }

  // 4. Проверяем стол.
  const tables = await getRows<TableRow>(
    config,
    "studio_tables",
    {
      select: "id,studio_id,is_active",
      id: `eq.${booking.table_id}`,
      limit: "1",
    },
  );

  const table = tables[0];

  if (!table || !table.is_active) {
    throw new DoorAccessError(
      "Стол не найден или отключён.",
      403,
    );
  }

  // 5. Проверяем клуб.
  const studios = await getRows<StudioRow>(
    config,
    "studios",
    {
      select: "id,is_active",
      id: `eq.${table.studio_id}`,
      is_active: "eq.true",
      limit: "1",
    },
  );

  if (!studios[0]) {
    throw new DoorAccessError(
      "Клуб не найден или отключён.",
      403,
    );
  }

  // 6. Находим ровно один активный дверной контроллер клуба.
  const devices = await getRows<DeviceRow>(
    config,
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
    throw new DoorAccessError(
      "В клубе не зарегистрирован активный контроллер двери.",
      409,
    );
  }

  if (devices.length !== 1) {
    throw new DoorAccessError(
      "Ошибка конфигурации: у клуба несколько дверных контроллеров.",
      409,
    );
  }

  const device = devices[0];

  if (!device.token_hash) {
    throw new DoorAccessError(
      "У контроллера отсутствует секретный ключ.",
      409,
    );
  }

  // 7. Переводим просроченные команды этого устройства в expired.
  const expireUrl = new URL(
    `${config.url}/rest/v1/device_commands`,
  );

  expireUrl.searchParams.set(
    "device_id",
    `eq.${device.id}`,
  );
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
    signal: AbortSignal.timeout(10000),
  });

  if (!expireResponse.ok) {
    console.error(
      "Door command expiration failed:",
      expireResponse.status,
    );

    throw new DoorAccessError(
      "Не удалось проверить предыдущие команды.",
      503,
    );
  }

  // 8. Создаём команду со сроком действия 15 секунд.
  const expiresAt = new Date(
    now.getTime() + 15_000,
  ).toISOString();

  const commandPayload: Record<string, unknown> = {
    device_id: device.id,
    booking_id: booking.id,
    requested_by: args.userId,
    command: "unlock",
    status: "pending",
    expires_at: expiresAt,
  };

  // Для сайта поле не передаём: до применения миграции
  // его может ещё не существовать в базе.
  // Telegram использует его только после применения миграции.
  if (args.requestChannel === "telegram") {
    commandPayload.request_channel = "telegram";
  }

  const insertResponse = await fetch(
    `${config.url}/rest/v1/device_commands`,
    {
      method: "POST",
      headers: {
        ...apiHeaders(config.key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(commandPayload),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!insertResponse.ok) {
    const details = await insertResponse.text();

    if (insertResponse.status === 409) {
      throw new DoorAccessError(
        "Для двери уже существует активная команда. Подождите несколько секунд.",
        409,
      );
    }

    console.error(
      "Door command insert failed:",
      insertResponse.status,
      details,
    );

    throw new DoorAccessError(
      "Не удалось создать команду открытия двери.",
      503,
    );
  }

  const commands: unknown = await insertResponse.json();

  const command = Array.isArray(commands)
    ? (commands[0] as CommandRow | undefined)
    : undefined;

  if (!command) {
    throw new DoorAccessError(
      "Не удалось подтвердить создание команды.",
      503,
    );
  }

  return {
    ok: true,
    command_id: command.id,
    status: command.status,
    expires_at: command.expires_at,
    message: "Команда открытия передана в очередь.",
  };
}

export function doorAccessErrorResponse(
  error: DoorAccessError,
) {
  return NextResponse.json(
    { error: error.message },
    {
      status: error.status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
