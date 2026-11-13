
import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeviceRow = {
  id: string;
  status: string;
  device_type: string;
  token_hash: string;
};

type CommandRow = {
  id: string;
  booking_id: string | null;
  command: string;
  expires_at: string;
};

function jsonError(message: string, status: number) {
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

function constantTimeHexEqual(left: string, right: string) {
  if (
    !/^[a-f0-9]{64}$/i.test(left) ||
    !/^[a-f0-9]{64}$/i.test(right)
  ) {
    return false;
  }

  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");

  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const config = getConfig();

  if (!config) {
    return jsonError("Сервис временно недоступен.", 503);
  }

  // 1. Проверяем токен дверного контроллера.
  const authorization =
    request.headers.get("authorization") || "";

  const match = authorization.match(
    /^Bearer\s+([A-Za-z0-9_-]{40,100})$/i,
  );

  if (!match) {
    return jsonError("Требуется токен устройства.", 401);
  }

  const tokenHash = createHash("sha256")
    .update(match[1])
    .digest("hex");

  const headers = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json",
  };

  try {
    // 2. Находим устройство по хешу токена.
    const lookup = new URL(
      `${config.url}/rest/v1/access_devices`,
    );

    lookup.searchParams.set(
      "select",
      "id,status,device_type,token_hash",
    );
    lookup.searchParams.set("token_hash", `eq.${tokenHash}`);
    lookup.searchParams.set("device_type", "eq.door");
    lookup.searchParams.set("limit", "1");

    const lookupResponse = await fetch(lookup, {
      headers,
      cache: "no-store",
    });

    if (!lookupResponse.ok) {
      console.error(
        "Device command lookup failed:",
        lookupResponse.status,
      );

      return jsonError("Не удалось проверить устройство.", 503);
    }

    const rows: unknown = await lookupResponse.json();

    const device = Array.isArray(rows)
      ? (rows[0] as DeviceRow | undefined)
      : undefined;

    if (
      !device ||
      !constantTimeHexEqual(device.token_hash, tokenHash)
    ) {
      return jsonError("Токен устройства недействителен.", 401);
    }

    if (device.status !== "active") {
      return jsonError("Устройство отключено владельцем.", 403);
    }

    // 3. Атомарно забираем одну ожидающую команду.
    // Проверки оплаты, брони или роли владельца выполняет
    // исключительно защищённая SQL-функция.
    const rpcResponse = await fetch(
      `${config.url}/rest/v1/rpc/claim_device_command`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_device_id: device.id,
        }),
        cache: "no-store",
      },
    );

    if (!rpcResponse.ok) {
      console.error(
        "Claim device command failed:",
        rpcResponse.status,
      );

      return jsonError(
        "Не удалось получить команду устройства.",
        503,
      );
    }

    const result: unknown = await rpcResponse.json();

    if (!Array.isArray(result)) {
      console.error("Unexpected command RPC response format.");

      return jsonError("Некорректный ответ сервера.", 503);
    }

    // 4. Ожидающих команд нет.
    if (result.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          command: null,
          server_time: new Date().toISOString(),
        },
        {
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const command = result[0] as CommandRow;

    // 5. Проверяем формат команды.
    // booking_id может быть UUID или null:
    // UUID — клиентская бронь, null — команда владельца.
    const validBookingId =
      command.booking_id === null ||
      isUuid(command.booking_id);

    if (
      !isUuid(command.id) ||
      !validBookingId ||
      command.command !== "unlock" ||
      typeof command.expires_at !== "string" ||
      !Number.isFinite(Date.parse(command.expires_at))
    ) {
      console.error("Invalid device command format.");

      return jsonError("Некорректная команда устройства.", 503);
    }

    // 6. Передаём ESP32 команду.
    // null в booking_id намеренно сохраняется.
    return NextResponse.json(
      {
        ok: true,
        command: {
          id: command.id,
          command: command.command,
          booking_id: command.booking_id,
          expires_at: command.expires_at,
        },
        server_time: new Date().toISOString(),
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    console.error("Device commands API: unexpected server error.");

    return jsonError(
      "Не удалось обработать запрос устройства.",
      503,
    );
  }
}
