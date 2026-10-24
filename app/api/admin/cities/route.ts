
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

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) return null;
  return { url, key };
}

export async function GET(request: NextRequest) {
  const access = await requireOwner(request);
  if (!access.ok) return access.response;

  const config = getSupabaseConfig();
  if (!config) {
    return errorResponse("Сервис временно недоступен.", 503);
  }

  try {
    const response = await fetch(
      `${config.url}/rest/v1/cities?select=id,name,is_active,created_at&order=name.asc`,
      {
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error("Cities GET failed:", response.status);
      return errorResponse("Не удалось загрузить города.", 503);
    }

    const cities = await response.json();

    return NextResponse.json(
      { cities },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Cities GET error:", error);
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

  const config = getSupabaseConfig();
  if (!config) {
    return errorResponse("Сервис временно недоступен.", 503);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("Некорректный запрос.", 400);
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("name" in body) ||
    typeof body.name !== "string"
  ) {
    return errorResponse("Укажите название города.", 400);
  }

  const name = body.name.trim();

  if (name.length < 2 || name.length > 100) {
    return errorResponse(
      "Название города должно содержать от 2 до 100 символов.",
      400
    );
  }

  try {
    const response = await fetch(`${config.url}/rest/v1/cities`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ name }),
      cache: "no-store",
    });

    if (response.status === 409) {
      return errorResponse("Такой город уже существует.", 409);
    }

    if (!response.ok) {
      const details = await response.text();
      console.error("Cities POST failed:", response.status, details);

      if (response.status === 400 && details.includes("cities_name_lower_unique")) {
        return errorResponse("Такой город уже существует.", 409);
      }

      return errorResponse("Не удалось создать город.", 503);
    }

    const rows = await response.json();
    const city = Array.isArray(rows) ? rows[0] : null;

    if (!city) {
      return errorResponse("Не удалось подтвердить создание города.", 503);
    }

    return NextResponse.json(
      { city },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Cities POST error:", error);
    return errorResponse("Сервис временно недоступен.", 503);
  }
}
