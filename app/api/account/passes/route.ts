import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTokenFromRequest,
  isYooKassaReadyForPayments,
  resolveSessionUserId,
  supabaseRpc,
} from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PassRow = {
  id: string;
  plan_id: string | null;
  city_id: string;
  purchase_payment_group_id: string | null;
  plan_name_snapshot: string;
  plan_price_rub_snapshot: number;
  total_hours: number;
  remaining_hours: number;
  reserved_hours: number;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  purchased_at: string | null;
  purchase_local_date: string | null;
  timezone_snapshot: string | null;
  created_at: string;
};

type PassPlanRow = {
  id: string;
  city_id: string;
  name: string;
  description: string | null;
  price_rub: number;
  hours_count: number;
  is_active: boolean;
};

type CityRow = { id: string; name: string; timezone: string | null; is_active: boolean };

type PurchaseOrderResult = {
  state?: string;
  pass_id?: string;
  payment_group_id?: string;
  amount_rub?: number;
  hold_expires_at?: string | null;
};

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
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

async function getUserId(request: NextRequest) {
  const token = getSessionTokenFromRequest(request);
  if (!token) return null;
  return resolveSessionUserId(token);
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return response({ error: "Войдите в личный кабинет." }, 401);

    const [passes, plans, cities] = await Promise.all([
      selectRows<PassRow>("user_passes", {
        select:
          "id,plan_id,city_id,purchase_payment_group_id,plan_name_snapshot,plan_price_rub_snapshot,total_hours,remaining_hours,reserved_hours,status,starts_at,expires_at,purchased_at,purchase_local_date,timezone_snapshot,created_at",
        user_id: `eq.${userId}`,
        order: "created_at.desc",
      }),
      selectRows<PassPlanRow>("pass_plans", {
        select: "id,city_id,name,description,price_rub,hours_count,is_active",
        is_active: "eq.true",
        order: "created_at.asc",
      }),
      selectRows<CityRow>("cities", {
        select: "id,name,timezone,is_active",
        order: "name.asc",
      }),
    ]);

    const purchaseGroupIds = passes
      .map((pass) => pass.purchase_payment_group_id)
      .filter((id): id is string => Boolean(id));
    const lateGroups = purchaseGroupIds.length > 0
      ? await selectRows<{ id: string }>("payment_groups", {
          select: "id",
          id: `in.(${purchaseGroupIds.join(",")})`,
          failure_reason: "like.*late_pass_purchase_review_required*",
        })
      : [];
    const lateReviewGroupIds = new Set(lateGroups.map((group) => group.id));
    const cityById = new Map(cities.map((city) => [city.id, city]));
    return response({
      passes: passes.map((pass) => ({
        ...pass,
        late_payment_review: pass.status === "cancelled" && Boolean(pass.purchase_payment_group_id && lateReviewGroupIds.has(pass.purchase_payment_group_id)),
        city_name: cityById.get(pass.city_id)?.name ?? "Город не указан",
      })),
      plans: plans
        .filter((plan) => cityById.get(plan.city_id)?.is_active)
        .map((plan) => ({
          ...plan,
          city_name: cityById.get(plan.city_id)?.name ?? "Город не указан",
          timezone: cityById.get(plan.city_id)?.timezone ?? null,
          validity_label: "1 календарный месяц",
        })),
    });
  } catch (error) {
    console.error("[account-passes] GET failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return response({ error: "Не удалось загрузить абонементы." }, 503);
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return response({ error: "Недопустимый запрос." }, 403);
  }

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
  if (!isUuid(input.plan_id) || !isUuid(input.request_key)) {
    return response({ error: "Укажите корректный тариф абонемента." }, 400);
  }

  try {
    const userId = await getUserId(request);
    if (!userId) return response({ error: "Войдите в личный кабинет." }, 401);
    if (!isYooKassaReadyForPayments()) {
      return response({ error: "Покупка абонемента временно недоступна: платёжный сервис не настроен." }, 503);
    }

    const result = await supabaseRpc<PurchaseOrderResult>(
      "create_customer_pass_purchase_order",
      {
        p_user_id: userId,
        p_plan_id: input.plan_id,
        p_request_key: input.request_key,
      },
    );

    if (result?.state === "expired") {
      return response({ error: "Срок предыдущего резерва покупки истёк. Создайте новый заказ." }, 409);
    }
    if (result?.state === "succeeded") {
      return response({ success: true, state: "succeeded", pass_id: result.pass_id });
    }
    if (result?.state !== "pending" || !isUuid(result.payment_group_id)) {
      return response({ error: "Не удалось создать заказ абонемента." }, 409);
    }

    return response({
      success: true,
      state: "pending",
      pass_id: result.pass_id,
      payment_group_id: result.payment_group_id,
      amount_rub: result.amount_rub,
      hold_expires_at: result.hold_expires_at,
    });
  } catch (error) {
    console.error("[account-passes] purchase order failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return response({ error: "Не удалось создать заказ абонемента. Повторите попытку." }, 503);
  }
}
