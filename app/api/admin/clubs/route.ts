
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/app/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const access = await requireOwner(request);
  if (!access.ok) return access.response;

  const config = getConfig();
  if (!config) {
    return errorResponse("Сервис временно недоступен.", 503);
  }

  try {
    const response = await fetch(
      `${config.url}/rest/v1/studios?select=id,city_id,name,address,timezone,is_active,created_at&order=name.asc`,
      {
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
        cache: "no-store",
      }
    );

   if (!response.ok) {
  const details = await response.text();
  console.error(
    "Clubs GET failed:",
    response.status,
    details
  );
  return errorResponse("Не удалось загрузить клубы.", 503);
}

    return NextResponse.json(
      { clubs: await response.json() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Clubs GET error:", error);
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
  if (!config) {
    return errorResponse("Сервис временно недоступен.", 503);
  }

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
  const cityId = data.city_id;
  const name = data.name;
  const address = data.address;
  const timezone = data.timezone ?? "Europe/Moscow";

  if (
    typeof cityId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cityId)
  ) {
    return errorResponse("Выберите город.", 400);
  }

  if (
    typeof name !== "string" ||
    name.trim().length < 2 ||
    name.trim().length > 120
  ) {
    return errorResponse(
      "Название клуба должно содержать от 2 до 120 символов.",
      400
    );
  }

  if (
    typeof address !== "string" ||
    address.trim().length < 5 ||
    address.trim().length > 300
  ) {
    return errorResponse(
      "Укажите адрес клуба (от 5 до 300 символов).",
      400
    );
  }

  if (
    typeof timezone !== "string" ||
    timezone.length > 100 ||
    !isValidTimezone(timezone)
  ) {
    return errorResponse("Укажите корректный часовой пояс.", 400);
  }

  try {
    const cityUrl = new URL(`${config.url}/rest/v1/cities`);
    cityUrl.searchParams.set("select", "id");
    cityUrl.searchParams.set("id", `eq.${cityId}`);
    cityUrl.searchParams.set("is_active", "eq.true");
    cityUrl.searchParams.set("limit", "1");

    const cityResponse = await fetch(cityUrl, {
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
      cache: "no-store",
    });

    if (!cityResponse.ok) {
      console.error("Club city check failed:", cityResponse.status);
      return errorResponse("Не удалось проверить город.", 503);
    }

    const cities = await cityResponse.json();
    if (!Array.isArray(cities) || cities.length === 0) {
      return errorResponse(
        "Город не найден или отключён. Обновите список городов.",
        400
      );
    }

    const response = await fetch(`${config.url}/rest/v1/studios`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        city_id: cityId,
        name: name.trim(),
        address: address.trim(),
        timezone,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        "Clubs POST failed:",
        response.status,
        await response.text()
      );
      return errorResponse("Не удалось создать клуб.", 503);
    }

    const rows = await response.json();
    const club = Array.isArray(rows) ? rows[0] : null;

    if (!club) {
      return errorResponse("Не удалось подтвердить создание клуба.", 503);
    }

    return NextResponse.json(
      { club },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Clubs POST error:", error);
    return errorResponse("Сервис временно недоступен.", 503);
  }
}
