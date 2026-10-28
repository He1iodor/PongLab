import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeviceRow = {
  id: string;
  status: "active" | "disabled";
  token_hash: string;
};

function jsonError(message: string, status: number) {
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

function constantTimeHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const config = getConfig();
  if (!config) return jsonError("Сервис временно недоступен.", 503);

  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{40,100})$/i);
  if (!match) return jsonError("Требуется токен устройства.", 401);

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
  const doorState = data.door_state;
  const firmwareVersion = data.firmware_version;
  if (doorState !== "open" && doorState !== "closed" && doorState !== "unknown") {
    return jsonError("door_state должен быть open, closed или unknown.", 400);
  }
  if (typeof firmwareVersion !== "string" || firmwareVersion.length < 1 || firmwareVersion.length > 40) {
    return jsonError("Укажите корректную версию прошивки.", 400);
  }

  const tokenHash = createHash("sha256").update(match[1]).digest("hex");
  const headers = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json",
  };

  try {
    const lookup = new URL(`${config.url}/rest/v1/access_devices`);
    lookup.searchParams.set("select", "id,status,token_hash");
    lookup.searchParams.set("token_hash", `eq.${tokenHash}`);
    lookup.searchParams.set("limit", "1");

    const lookupResponse = await fetch(lookup, {
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
      cache: "no-store",
    });
    if (!lookupResponse.ok) {
      console.error("Device heartbeat lookup failed:", lookupResponse.status, await lookupResponse.text());
      return jsonError("Не удалось проверить устройство.", 503);
    }

    const rows: unknown = await lookupResponse.json();
    const device = Array.isArray(rows) ? rows[0] as DeviceRow | undefined : undefined;
    if (!device || !constantTimeHexEqual(device.token_hash, tokenHash)) {
      return jsonError("Токен устройства недействителен.", 401);
    }
    if (device.status !== "active") return jsonError("Устройство отключено владельцем.", 403);

    const update = new URL(`${config.url}/rest/v1/access_devices`);
    update.searchParams.set("id", `eq.${device.id}`);
    update.searchParams.set("status", "eq.active");
    const updateResponse = await fetch(update, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        door_state: doorState,
        firmware_version: firmwareVersion,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      cache: "no-store",
    });
    if (!updateResponse.ok) {
      console.error("Device heartbeat update failed:", updateResponse.status, await updateResponse.text());
      return jsonError("Не удалось сохранить состояние устройства.", 503);
    }

    return NextResponse.json({ ok: true, server_time: new Date().toISOString() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Device heartbeat error:", error);
    return jsonError("Не удалось обработать heartbeat.", 503);
  }
}
