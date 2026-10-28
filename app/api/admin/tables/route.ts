
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
    }
  );
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function headers(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

export async function GET(request: NextRequest) {
  const access = await requireOwner(request);
  if (!access.ok) return access.response;

  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);

  const studioId = request.nextUrl.searchParams.get("studio_id");

  if (!studioId || !isUuid(studioId)) {
    return errorResponse("Укажите корректный идентификатор клуба.", 400);
  }

  try {
    const url = new URL(`${config.url}/rest/v1/studio_tables`);
    url.searchParams.set(
      "select",
      "id,studio_id,name,is_active,created_at"
    );
    url.searchParams.set("studio_id", `eq.${studioId}`);
    url.searchParams.set("order", "created_at.asc");

    const response = await fetch(url, {
      headers: headers(config.key),
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("Tables GET failed:", response.status, details);
      return errorResponse("Не удалось загрузить столы.", 503);
    }

    return NextResponse.json(
      { tables: await response.json() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Tables GET error:", error);
    return errorResponse("Сервис временно недоступен.", 503);
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

  if (!body || typeof body !== "object") {
    return errorResponse("Некорректный запрос.", 400);
  }

  const data = body as Record<string, unknown>;
  const studioId = data.studio_id;
  const name = data.name;

  if (typeof studioId !== "string" || !isUuid(studioId)) {
    return errorResponse("Выберите клуб.", 400);
  }

  if (
    typeof name !== "string" ||
    name.trim().length < 1 ||
    name.trim().length > 80
  ) {
    return errorResponse(
      "Название стола должно содержать от 1 до 80 символов.",
      400
    );
  }

  try {
    const studioUrl = new URL(`${config.url}/rest/v1/studios`);
    studioUrl.searchParams.set("select", "id");
    studioUrl.searchParams.set("id", `eq.${studioId}`);
    studioUrl.searchParams.set("is_active", "eq.true");
    studioUrl.searchParams.set("limit", "1");

    const studioResponse = await fetch(studioUrl, {
      headers: headers(config.key),
      cache: "no-store",
    });

    if (!studioResponse.ok) {
      const details = await studioResponse.text();
      console.error("Table studio check failed:", studioResponse.status, details);
      return errorResponse("Не удалось проверить клуб.", 503);
    }

    const studios = await studioResponse.json();

    if (!Array.isArray(studios) || studios.length === 0) {
      return errorResponse("Клуб не найден или отключён.", 400);
    }

    const response = await fetch(`${config.url}/rest/v1/studio_tables`, {
      method: "POST",
      headers: {
        ...headers(config.key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        studio_id: studioId,
        name: name.trim(),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("Tables POST failed:", response.status, details);
      return errorResponse("Не удалось создать стол.", 503);
    }

    const rows = await response.json();
    const table = Array.isArray(rows) ? rows[0] : null;

    if (!table) {
      return errorResponse("Не удалось подтвердить создание стола.", 503);
    }

    return NextResponse.json(
      { table },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Tables POST error:", error);
    return errorResponse("Сервис временно недоступен.", 503);
  }
}
