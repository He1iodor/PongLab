import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/app/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function validatePlan(input: Record<string, unknown>) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : null;
  const price = input.price_rub;
  const hours = input.hours_count;

  if (
    name.length < 1 || name.length > 120 ||
    (description !== null && description.length > 1000) ||
    !Number.isSafeInteger(price) || Number(price) < 1 ||
    !Number.isSafeInteger(hours) || Number(hours) < 1 || Number(hours) > 1000
  ) return null;

  return {
    name,
    description: description || null,
    price_rub: Number(price),
    hours_count: Number(hours),
  };
}

export async function GET(request: NextRequest) {
  const access = await requireOwner(request);
  if (!access.ok) return access.response;

  try {
    const [cities, plans, lateGroups] = await Promise.all([
      selectRows<Record<string, unknown>>("cities", {
        select: "id,name,timezone,is_active",
        order: "name.asc",
      }),
      selectRows<Record<string, unknown>>("pass_plans", {
        select: "id,city_id,name,description,price_rub,hours_count,is_active,created_at,updated_at",
        order: "created_at.desc",
      }),
      selectRows<Record<string, unknown>>("payment_groups", {
        select: "id,user_id,provider_payment_id,status,amount_rub,paid_at,failure_reason,created_at",
        order: "created_at.desc",
        failure_reason: "like.*late_pass_purchase_review_required*",
        order_type: "eq.pass_purchase",
        limit: "100",
      }),
    ]);
    const cityById = new Map(cities.map((city) => [String(city.id), city]));
    const groupIds = lateGroups.map((group) => String(group.id)).filter(Boolean);
    const passes = groupIds.length > 0
      ? await selectRows<Record<string, unknown>>("user_passes", {
          select: "id,user_id,purchase_payment_group_id,city_id,plan_name_snapshot,status,purchase_local_date,expires_at,remaining_hours,total_hours",
          purchase_payment_group_id: `in.(${groupIds.join(",")})`,
        })
      : [];
    const passByGroupId = new Map(
      passes.map((pass) => [String(pass.purchase_payment_group_id), pass]),
    );
    return response({
      cities,
      plans: plans.map((plan) => ({
        ...plan,
        city_name: (cityById.get(String(plan.city_id))?.name as string | undefined) ?? "Город не указан",
        validity_label: "1 календарный месяц",
      })),
      late_payment_reviews: lateGroups
        .map((group) => ({ group, pass: passByGroupId.get(String(group.id)) }))
        .filter(({ pass }) => !pass || pass.status === "cancelled")
        .map(({ group, pass }) => {
        return {
          ...group,
          user_pass_id: pass?.id ?? null,
          pass_name: pass?.plan_name_snapshot ?? "Абонемент не найден",
          pass_status: pass?.status ?? "missing",
          pass_purchase_local_date: pass?.purchase_local_date ?? null,
          pass_expires_at: pass?.expires_at ?? null,
          city_name: (cityById.get(String(pass?.city_id))?.name as string | undefined) ?? "Город не указан",
        };
      }),
    });
  } catch (error) {
    console.error("[admin-passes] GET failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return response({ error: "Не удалось загрузить тарифы абонементов." }, 503);
  }
}

export async function POST(request: NextRequest) {
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
  if (!isUuid(input.city_id)) return response({ error: "Выберите город." }, 400);
  const plan = validatePlan(input);
  if (!plan) return response({ error: "Проверьте название, цену и количество часов." }, 400);

  const config = getConfig();
  if (!config) return response({ error: "Сервис временно недоступен." }, 503);

  try {
    const cities = await selectRows<{ id: string; is_active: boolean }>("cities", {
      select: "id,is_active",
      id: `eq.${input.city_id}`,
      limit: "1",
    });
    if (cities.length !== 1 || !cities[0].is_active) {
      return response({ error: "Выбранный город неактивен." }, 409);
    }

    const result = await fetch(`${config.url}/rest/v1/pass_plans`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        city_id: input.city_id,
        ...plan,
        is_active: true,
        created_by: access.userId,
      }),
      cache: "no-store",
    });

    if (!result.ok) {
      console.error("[admin-passes] create failed", { status: result.status });
      return response({ error: "Не удалось создать тариф." }, 503);
    }
    const rows: unknown = await result.json();
    return response({ success: true, plan: Array.isArray(rows) ? rows[0] : null });
  } catch (error) {
    console.error("[admin-passes] POST failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return response({ error: "Не удалось создать тариф." }, 503);
  }
}

export async function PATCH(request: NextRequest) {
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
  if (!isUuid(input.plan_id)) return response({ error: "Некорректный тариф." }, 400);
  const plan = validatePlan(input);
  if (!plan || typeof input.is_active !== "boolean") {
    return response({ error: "Проверьте параметры тарифа." }, 400);
  }

  const config = getConfig();
  if (!config) return response({ error: "Сервис временно недоступен." }, 503);

  try {
    const target = new URL(`${config.url}/rest/v1/pass_plans`);
    target.searchParams.set("id", `eq.${input.plan_id}`);
    const result = await fetch(target, {
      method: "PATCH",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        ...plan,
        is_active: input.is_active,
        updated_at: new Date().toISOString(),
      }),
      cache: "no-store",
    });

    if (!result.ok) {
      console.error("[admin-passes] update failed", { status: result.status });
      return response({ error: "Не удалось обновить тариф." }, 503);
    }
    const rows: unknown = await result.json();
    if (!Array.isArray(rows) || rows.length !== 1) {
      return response({ error: "Тариф не найден." }, 404);
    }
    return response({ success: true, plan: rows[0] });
  } catch (error) {
    console.error("[admin-passes] PATCH failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return response({ error: "Не удалось обновить тариф." }, 503);
  }
}
