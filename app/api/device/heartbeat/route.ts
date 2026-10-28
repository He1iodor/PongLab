import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DoorState = "open" | "closed" | "unknown";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function apiHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

export async function POST(request: NextRequest) {
  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{32,128})$/);
  if (!match) return errorResponse("Требуется токен устройства.", 401);

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
  const doorState = data.door_state;
  const firmwareVersion = data.firmware_version;
  if (doorState !== "open" && doorState !== "closed" && doorState !== "unknown") {
    return errorResponse("Некорректное состояние двери.", 400);
  }
  if (firmwareVersion !== undefined && (typeof firmwareVersion !== "string" || firmwareVersion.length > 40)) {
    return errorResponse("Некорректная версия прошивки.", 400);
  }

  const tokenHash = createHash("sha256").update(match[1]).digest("hex");
  try {
    const lookupUrl = new URL(`${config.url}/rest/v1/access_devices`);
    lookupUrl.searchParams.set("select", "id,status");
    lookupUrl.searchParams.set("token_hash", `eq.${tokenHash}`);
    lookupUrl.searchParams.set("status", "eq.active");
    lookupUrl.searchParams.set("limit", "1");
    const lookup = await fetch(lookupUrl, { headers: apiHeaders(config.key), cache: "no-store" });
    if (!lookup.ok) {
      console.error("Device heartbeat lookup failed:", lookup.status, await lookup.text());
      return errorResponse("Не удалось проверить устройство.", 503);
    }
    const rows: unknown = await lookup.json();
    const device = Array.isArray(rows) ? rows[0] as { id: string } | undefined : undefined;
    if (!device) return errorResponse("Устройство не авторизовано или отключено.", 401);

    const updateUrl = new URL(`${config.url}/rest/v1/access_devices`);
    updateUrl.searchParams.set("id", `eq.${device.id}`);
    updateUrl.searchParams.set("status", "eq.active");
    const patch: Record<string, string> = {
      last_seen_at: new Date().toISOString(),
      door_state: doorState as DoorState,
      updated_at: new Date().toISOString(),
    };
    if (typeof firmwareVersion === "string") patch.firmware_version = firmwareVersion;

    const update = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        ...apiHeaders(config.key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
      cache: "no-store",
    });
    if (!update.ok) {
      console.error("Device heartbeat update failed:", update.status, await update.text());
      return errorResponse("Не удалось сохранить состояние устройства.", 503);
    }
    const updated: unknown = await update.json();
    if (!Array.isArray(updated) || updated.length === 0) {
      return errorResponse("Устройство было отключено. Повторная авторизация не выполнена.", 401);
    }

    // This endpoint only reports health/state. It does not unlock a door.
    return NextResponse.json({ ok: true, poll_after_seconds: 15 }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Device heartbeat error:", error);
    return errorResponse("Ошибка связи с сервером.", 503);
  }
}
