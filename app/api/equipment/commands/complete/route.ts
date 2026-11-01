
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

type CompletionRow = {
  id: string;
  status: string;
  completed_at: string;
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

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export async function POST(request: NextRequest) {
  const config = getConfig();

  if (!config) {
    return jsonError("Сервис временно недоступен.", 503);
  }

  // 1. Проверяем токен ESP32.
  const authorization =
    request.headers.get("authorization") || "";

  const match = authorization.match(
    /^Bearer\s+([A-Za-z0-9_-]{40,100})$/i,
  );

  if (!match) {
    return jsonError("Требуется токен устройства.", 401);
  }

  // 2. Проверяем входные данные.
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Некорректный JSON.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("Некорректный запрос.", 400);
  }

  const data = body as Record<string, unknown>;

  if (!isUuid(data.command_id)) {
    return jsonError("Некорректный ID команды.", 400);
  }

  if (data.result !== "success" && data.result !== "failed") {
    return jsonError("Некорректный результат команды.", 400);
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
    // 3. Находим активный дверной контроллер.
    const lookup = new URL(
      `${config.url}/rest/v1/access_devices`,
    );

    lookup.searchParams.set("select", "id,status,device_type,token_hash");
    lookup.searchParams.set("token_hash", `eq.${tokenHash}`);
    lookup.searchParams.set("device_type", "eq.door");
    lookup.searchParams.set("limit", "1");

    const lookupResponse = await fetch(lookup, {
      headers,
      cache: "no-store",
    });

    if (!lookupResponse.ok) {
      console.error(
        "Device completion lookup failed:",
        lookupResponse.status,
        await lookupResponse.text(),
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

    // 4. Подтверждаем выполнение через атомарную SQL-функцию.
    const completionResponse = await fetch(
      `${config.url}/rest/v1/rpc/complete_device_command`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_device_id: device.id,
          p_command_id: data.command_id,
          p_result: data.result,
        }),
        cache: "no-store",
      },
    );

    if (!completionResponse.ok) {
      console.error(
        "Device completion RPC failed:",
        completionResponse.status,
        await completionResponse.text(),
      );

      return jsonError("Не удалось подтвердить выполнение команды.", 503);
    }

    const completion: unknown = await completionResponse.json();

    if (!Array.isArray(completion)) {
      return jsonError("Некорректный ответ сервера.", 503);
    }

    if (completion.length === 0) {
      return jsonError(
        "Команда не найдена или уже обработана.",
        409,
      );
    }

    const completed = completion[0] as CompletionRow;

    return NextResponse.json(
      {
        ok: true,
        command_id: completed.id,
        status: completed.status,
        completed_at: completed.completed_at,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Device completion API error:", error);

    return jsonError(
      "Не удалось обработать подтверждение команды.",
      503,
    );
  }
}
