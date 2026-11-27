import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/app/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ServiceKey = "joint_play" | "coach_session";
type ChargeMode = "per_slot" | "per_group";

type AvailabilityRules = {
  weekdays?: number[];
  date_ranges?: Array<{ from: string; to: string }>;
  time_intervals?: Array<{ starts_at: string; ends_at: string }>;
};

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

async function selectRows<T>(table: string, params: Record<string, string>): Promise<T[]> {
  const config = getConfig();
  if (!config) throw new Error("Supabase configuration is unavailable.");
  const target = new URL(`${config.url}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  const result = await fetch(target, {
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) throw new Error(`Supabase ${table} lookup failed (${result.status}).`);
  const data: unknown = await result.json();
  if (!Array.isArray(data)) throw new Error(`Supabase ${table} returned an invalid result.`);
  return data as T[];
}

function validateAvailabilityRules(value: unknown): value is AvailabilityRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rules = value as Record<string, unknown>;

  if (rules.weekdays !== undefined) {
    if (
      !Array.isArray(rules.weekdays) ||
      rules.weekdays.some((day) => !Number.isInteger(day) || Number(day) < 1 || Number(day) > 7)
    ) return false;
  }

  if (rules.date_ranges !== undefined) {
    if (
      !Array.isArray(rules.date_ranges) ||
      rules.date_ranges.some((range) => {
        if (!range || typeof range !== "object" || Array.isArray(range)) return true;
        const item = range as Record<string, unknown>;
        return (
          typeof item.from !== "string" ||
          typeof item.to !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(item.from) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(item.to) ||
          item.from > item.to
        );
      })
    ) return false;
  }

  if (rules.time_intervals !== undefined) {
    if (
      !Array.isArray(rules.time_intervals) ||
      rules.time_intervals.some((interval) => {
        if (!interval || typeof interval !== "object" || Array.isArray(interval)) return true;
        const item = interval as Record<string, unknown>;
        return (
          typeof item.starts_at !== "string" ||
          typeof item.ends_at !== "string" ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.starts_at) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.ends_at) ||
          item.starts_at >= item.ends_at
        );
      })
    ) return false;
  }

  return true;
}

export async function GET(request: NextRequest) {
  const access = await requireOwner(request);
  if (!access.ok) return access.response;

  try {
    const [studios, services] = await Promise.all([
      selectRows<Record<string, unknown>>("studios", {
        select: "id,name,address,city_id,timezone,is_active",
        is_active: "eq.true",
        order: "name.asc",
      }),
      selectRows<Record<string, unknown>>("studio_services", {
        select:
          "id,studio_id,service_key,title,description,is_enabled,price_rub,charge_mode,availability_rules,updated_at",
        order: "studio_id.asc,service_key.asc",
      }),
    ]);

    return response({ studios, services });
  } catch (error) {
    console.error("[admin-services] GET failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return response({ error: "Не удалось загрузить настройки услуг." }, 503);
  }
}

export async function PUT(request: NextRequest) {
  const access = await requireOwner(request);
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ error: "Некорректный запрос." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return response({ error: "Некорректный запрос." }, 400);
  }

  const input = body as Record<string, unknown>;
  const studioId = input.studio_id;
  const serviceKey = input.service_key;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : null;
  const price = input.price_rub;
  const enabled = input.is_enabled;
  const chargeMode = input.charge_mode;
  const rules = input.availability_rules;

  if (
    typeof studioId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studioId) ||
    (serviceKey !== "joint_play" && serviceKey !== "coach_session") ||
    title.length < 1 || title.length > 120 ||
    (description !== null && description.length > 1000) ||
    !Number.isSafeInteger(price) || Number(price) < 0 ||
    typeof enabled !== "boolean" ||
    (chargeMode !== "per_slot" && chargeMode !== "per_group") ||
    !validateAvailabilityRules(rules)
  ) {
    return response({ error: "Проверьте название, цену и правила доступности услуги." }, 400);
  }

  if (enabled && Number(price) < 1) {
    return response({ error: "Для включённой услуги укажите цену больше нуля." }, 400);
  }

  const config = getConfig();
  if (!config) return response({ error: "Сервис временно недоступен." }, 503);

  try {
    const target = new URL(`${config.url}/rest/v1/studio_services`);
    target.searchParams.set("on_conflict", "studio_id,service_key");
    const result = await fetch(target, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        studio_id: studioId,
        service_key: serviceKey as ServiceKey,
        title,
        description: description || null,
        price_rub: Number(price),
        is_enabled: enabled,
        charge_mode: chargeMode as ChargeMode,
        availability_rules: rules,
        updated_at: new Date().toISOString(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!result.ok) {
      console.error("[admin-services] upsert failed", { status: result.status });
      return response({ error: "Не удалось сохранить услугу." }, 503);
    }

    const rows: unknown = await result.json();
    return response({ success: true, service: Array.isArray(rows) ? rows[0] : null });
  } catch (error) {
    console.error("[admin-services] PUT failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return response({ error: "Не удалось сохранить услугу." }, 503);
  }
}
