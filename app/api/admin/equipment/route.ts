import { randomBytes, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/app/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StudioRow = { id: string; name: string; is_active: boolean };
type DeviceRow = {
  id: string;
  studio_id: string;
  name: string;
  device_code: string;
  status: "active" | "disabled";
  door_state: "open" | "closed" | "unknown";
  last_seen_at: string | null;
  firmware_version: string | null;
  created_at: string;
};

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
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function apiHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function readRows<T>(url: string, key: string, table: string, params: Record<string, string>): Promise<T[]> {
  const target = new URL(`${url}/rest/v1/${table}`);
  for (const [name, value] of Object.entries(params)) target.searchParams.set(name, value);
  const response = await fetch(target, { headers: apiHeaders(key), cache: "no-store" });
  if (!response.ok) {
    console.error(`Equipment query failed (${table}):`, response.status, await response.text());
    throw new Error("Не удалось загрузить данные оборудования.");
  }
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error("Некорректный ответ базы данных.");
  return rows as T[];
}

export async function GET(request: NextRequest) {
  const access = await requireOwner(request);
  if (!access.ok) return access.response;
  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);

  try {
    const [devices, studios] = await Promise.all([
      readRows<DeviceRow>(config.url, config.key, "access_devices", {
        select: "id,studio_id,name,device_code,status,door_state,last_seen_at,firmware_version,created_at",
        order: "created_at.desc",
        limit: "500",
      }),
      readRows<StudioRow>(config.url, config.key, "studios", {
        select: "id,name,is_active",
        order: "name.asc",
        limit: "1000",
      }),
    ]);

    const studioMap = new Map(studios.map((studio) => [studio.id, studio]));
    const result = devices.map((device) => ({
      ...device,
      studio_name: studioMap.get(device.studio_id)?.name ?? "Клуб не найден",
      studio_is_active: studioMap.get(device.studio_id)?.is_active ?? false,
    }));

    return NextResponse.json({ devices: result, studios }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Admin equipment GET error:", error);
    return errorResponse("Не удалось загрузить оборудование.", 503);
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("Недопустимый запрос.", 403);
  }

  const access = await requireOwner(request);
  if (!access.ok) return access.response;
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

  const data = body as Record<string, unknown>;
  if (data.action === "disable") {
    if (!isUuid(data.device_id)) return errorResponse("Укажите корректное устройство.", 400);
    try {
      const target = new URL(`${config.url}/rest/v1/access_devices`);
      target.searchParams.set("id", `eq.${data.device_id}`);
      target.searchParams.set("status", "eq.active");
      const response = await fetch(target, {
        method: "PATCH",
        headers: {
          ...apiHeaders(config.key),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ status: "disabled", updated_at: new Date().toISOString() }),
        cache: "no-store",
      });
      if (!response.ok) {
        console.error("Disable device failed:", response.status, await response.text());
        return errorResponse("Не удалось отключить устройство.", 503);
      }
      const rows: unknown = await response.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return errorResponse("Устройство не найдено или уже отключено.", 404);
      }
      return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("Disable device error:", error);
      return errorResponse("Не удалось отключить устройство.", 503);
    }
  }

  const studioId = data.studio_id;
  const name = data.name;
  if (!isUuid(studioId)) return errorResponse("Выберите клуб.", 400);
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
    return errorResponse("Название устройства должно содержать от 2 до 100 символов.", 400);
  }

  try {
    const studios = await readRows<StudioRow>(config.url, config.key, "studios", {
      select: "id,name,is_active",
      id: `eq.${studioId}`,
      is_active: "eq.true",
      limit: "1",
    });
    if (studios.length === 0) return errorResponse("Клуб не найден или отключён.", 400);

    // Secret is shown only in the creation response. Only its SHA-256 hash is stored.
    const deviceToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(deviceToken).digest("hex");
    const deviceCode = randomBytes(5).toString("hex").toUpperCase();

    const response = await fetch(`${config.url}/rest/v1/access_devices`, {
      method: "POST",
      headers: {
        ...apiHeaders(config.key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        studio_id: studioId,
        name: name.trim(),
        device_code: deviceCode,
        token_hash: tokenHash,
        status: "active",
        door_state: "unknown",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Create device failed:", response.status, await response.text());
      return errorResponse("Не удалось зарегистрировать устройство.", 503);
    }

    const rows: unknown = await response.json();
    const device = Array.isArray(rows) ? rows[0] as DeviceRow | undefined : undefined;
    if (!device) return errorResponse("Не удалось подтвердить регистрацию устройства.", 503);

    return NextResponse.json({
      device: {
        id: device.id,
        studio_id: device.studio_id,
        name: device.name,
        device_code: device.device_code,
        status: device.status,
        door_state: device.door_state,
        created_at: device.created_at,
        studio_name: studios[0].name,
      },
      device_token: deviceToken,
      token_warning: "Сохраните токен сейчас. Повторно показать его нельзя.",
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Create device error:", error);
    return errorResponse("Не удалось зарегистрировать устройство.", 503);
  }
}
