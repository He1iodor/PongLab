import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StudioServiceRow = {
  id: string;
  studio_id: string;
  service_key: "joint_play" | "coach_session";
  title: string;
  description: string | null;
  is_enabled: boolean;
  price_rub: number;
  charge_mode: "per_slot" | "per_group";
  availability_rules: Record<string, unknown>;
};

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const studioId = request.nextUrl.searchParams.get("studio_id");
  if (
    !studioId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studioId)
  ) {
    return response({ error: "Укажите корректный клуб." }, 400);
  }

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return response({ error: "Сервис временно недоступен." }, 503);
  }

  try {
    const target = new URL(`${supabaseUrl}/rest/v1/studio_services`);
    target.searchParams.set(
      "select",
      "id,studio_id,service_key,title,description,is_enabled,price_rub,charge_mode,availability_rules",
    );
    target.searchParams.set("studio_id", `eq.${studioId}`);
    target.searchParams.set("is_enabled", "eq.true");
    target.searchParams.set("order", "service_key.asc");

    const result = await fetch(target, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!result.ok) {
      console.error("[studio-services] lookup failed", { status: result.status });
      return response({ error: "Не удалось загрузить дополнительные услуги." }, 503);
    }

    const services: unknown = await result.json();
    if (!Array.isArray(services)) {
      return response({ error: "Некорректный ответ сервера." }, 503);
    }

    return response({ services: services as StudioServiceRow[] });
  } catch (error) {
    console.error("[studio-services] request failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return response({ error: "Не удалось загрузить дополнительные услуги." }, 503);
  }
}
