
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/app/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(request: NextRequest) {
  // Защита от запросов с другого origin.
  const origin = request.headers.get("origin");

  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("Недопустимый запрос.", 403);
  }

  // Полная проверка сессии и роли владельца.
  const owner = await requireOwner(request);

  if (!owner.ok) {
    return owner.response;
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

  const deviceId = (body as Record<string, unknown>).device_id;

  if (!isUuid(deviceId)) {
    return errorResponse("Некорректный ID контроллера.", 400);
  }

  const headers = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json",
  };

  try {
    // 1. Проверяем активный дверной контроллер.
    const deviceUrl = new URL(
      `${config.url}/rest/v1/access_devices`,
    );

    deviceUrl.searchParams.set("select", "id,studio_id");
    deviceUrl.searchParams.set("id", `eq.${deviceId}`);
    deviceUrl.searchParams.set("device_type", "eq.door");
    deviceUrl.searchParams.set("status", "eq.active");
    deviceUrl.searchParams.set("limit", "1");

    const deviceResponse = await fetch(deviceUrl, {
      headers,
      cache: "no-store",
    });

    if (!deviceResponse.ok) {
      console.error(
        "Owner unlock: device lookup failed:",
        deviceResponse.status,
      );

      return errorResponse("Не удалось проверить контроллер.", 503);
    }

    const devices: unknown = await deviceResponse.json();

    const device =
      Array.isArray(devices) ? devices[0] : null;

    if (
      !device ||
      !isUuid(device.id) ||
      !isUuid(device.studio_id)
    ) {
      return errorResponse(
        "Активный дверной контроллер не найден.",
        404,
      );
    }

    // 2. Проверяем, что студия контроллера активна.
    const studioUrl = new URL(
      `${config.url}/rest/v1/studios`,
    );

    studioUrl.searchParams.set("select", "id");
    studioUrl.searchParams.set("id", `eq.${device.studio_id}`);
    studioUrl.searchParams.set("is_active", "eq.true");
    studioUrl.searchParams.set("limit", "1");

    const studioResponse = await fetch(studioUrl, {
      headers,
      cache: "no-store",
    });

    if (!studioResponse.ok) {
      console.error(
        "Owner unlock: studio lookup failed:",
        studioResponse.status,
      );

      return errorResponse("Не удалось проверить студию.", 503);
    }

    const studios: unknown = await studioResponse.json();

    if (!Array.isArray(studios) || studios.length === 0) {
      return errorResponse(
        "Студия контроллера отключена или не найдена.",
        403,
      );
    }

    // 3. Закрываем только уже просроченные команды.
    const now = new Date();

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
      `lte.${now.toISOString()}`,
    );

    const expireResponse = await fetch(expireUrl, {
      method: "PATCH",
      headers: {
        ...headers,
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
        "Owner unlock: expiration failed:",
        expireResponse.status,
      );

      return errorResponse(
        "Не удалось проверить предыдущие команды.",
        503,
      );
    }

    // 4. Создаём отдельную команду владельца.
    // Бронирование и оплата для неё не требуются.
    const expiresAt = new Date(
      now.getTime() + 15_000,
    ).toISOString();

    const insertResponse = await fetch(
      `${config.url}/rest/v1/device_commands`,
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          device_id: device.id,
          booking_id: null,
          command_source: "owner",
          requested_by: owner.userId,
          command: "unlock",
          status: "pending",
          expires_at: expiresAt,
        }),
        cache: "no-store",
      },
    );

    if (!insertResponse.ok) {
      console.error(
        "Owner unlock: command insert failed:",
        insertResponse.status,
      );

      if (insertResponse.status === 409) {
        return errorResponse(
          "У контроллера уже есть активная команда. Подожди несколько секунд.",
          409,
        );
      }

      return errorResponse(
        "Не удалось создать команду открытия.",
        503,
      );
    }

    const commands: unknown = await insertResponse.json();

    const command =
      Array.isArray(commands) ? commands[0] : null;

    if (!command?.id || !command?.expires_at) {
      return errorResponse(
        "Сервер не подтвердил создание команды.",
        503,
      );
    }

    return NextResponse.json(
      {
        ok: true,
        command_id: command.id,
        command_source: "owner",
        status: command.status,
        expires_at: command.expires_at,
        message:
          "Команда ручного открытия создана. Активная бронь и оплата не требуются.",
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    console.error("Owner unlock: unexpected server error.");

    return errorResponse(
      "Не удалось отправить команду открытия.",
      503,
    );
  }
}
