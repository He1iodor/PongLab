
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/app/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("Недопустимый запрос.", 403);
  }

  const owner = await requireOwner(request);
  if (!owner.ok) return owner.response;

  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);

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
    // Проверяем, что контроллер существует, активен и является дверным.
    const deviceUrl = new URL(
      `${config.url}/rest/v1/access_devices`,
    );

    deviceUrl.searchParams.set("select", "id");
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
        "Test unlock device lookup failed:",
        deviceResponse.status,
        await deviceResponse.text(),
      );

      return errorResponse("Не удалось проверить контроллер.", 503);
    }

    const devices = await deviceResponse.json();
    const device = Array.isArray(devices) ? devices[0] : null;

    if (!device) {
      return errorResponse(
        "Активный дверной контроллер не найден.",
        404,
      );
    }

    // Берём существующий ID бронирования только для связи записи
    // в device_commands. Оплата и время брони не проверяются.
    const bookingUrl = new URL(
      `${config.url}/rest/v1/bookings`,
    );

    bookingUrl.searchParams.set("select", "id");
    bookingUrl.searchParams.set("order", "start_at.desc");
    bookingUrl.searchParams.set("limit", "1");

    const bookingResponse = await fetch(bookingUrl, {
      headers,
      cache: "no-store",
    });

    if (!bookingResponse.ok) {
      console.error(
        "Test unlock booking lookup failed:",
        bookingResponse.status,
        await bookingResponse.text(),
      );

      return errorResponse(
        "Не удалось найти запись бронирования.",
        503,
      );
    }

    const bookings = await bookingResponse.json();
    const booking = Array.isArray(bookings) ? bookings[0] : null;

    if (!booking?.id) {
      return errorResponse(
        "В базе пока нет ни одной записи бронирования. Нужна хотя бы одна тестовая запись; активная бронь и оплата не требуются.",
        409,
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // Закрываем только просроченные команды этого контроллера.
    const expireUrl = new URL(
      `${config.url}/rest/v1/device_commands`,
    );

    expireUrl.searchParams.set("device_id", `eq.${device.id}`);
    expireUrl.searchParams.set("status", "in.(pending,claimed)");
    expireUrl.searchParams.set("expires_at", `lte.${nowIso}`);

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
        "Test unlock expiration failed:",
        expireResponse.status,
        await expireResponse.text(),
      );

      return errorResponse(
        "Не удалось очистить просроченные команды.",
        503,
      );
    }

    // Создаём команду с коротким сроком действия — 15 секунд.
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
          booking_id: booking.id,
          requested_by: owner.userId,
          command: "unlock",
          status: "pending",
          expires_at: expiresAt,
        }),
        cache: "no-store",
      },
    );

    if (!insertResponse.ok) {
      const details = await insertResponse.text();

      console.error(
        "Test unlock insert failed:",
        insertResponse.status,
        details,
      );

      if (insertResponse.status === 409) {
        return errorResponse(
          "У контроллера уже есть активная команда. Подожди несколько секунд.",
          409,
        );
      }

      return errorResponse(
        "Не удалось создать тестовую команду.",
        503,
      );
    }

    const commands = await insertResponse.json();
    const command = Array.isArray(commands) ? commands[0] : null;

    if (!command?.id) {
      return errorResponse(
        "Сервер не подтвердил создание команды.",
        503,
      );
    }

    return NextResponse.json(
      {
        ok: true,
        test: true,
        command_id: command.id,
        status: command.status,
        expires_at: command.expires_at,
        message:
          "Тестовая команда unlock отправлена контроллеру. Оплата и активная бронь не проверялись.",
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Admin test unlock error:", error);

    return errorResponse(
      "Не удалось отправить тестовую команду.",
      503,
    );
  }
}
