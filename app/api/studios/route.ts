import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function apiHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

export async function GET() {
  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);

  try {
    const studiosUrl = new URL(`${config.url}/rest/v1/studios`);
    studiosUrl.searchParams.set("select", "id,name,city_id,address,timezone");
    studiosUrl.searchParams.set("is_active", "eq.true");
    studiosUrl.searchParams.set("order", "name.asc");

    const studiosResponse = await fetch(studiosUrl, {
      headers: apiHeaders(config.key),
      cache: "no-store",
    });
    if (!studiosResponse.ok) {
      console.error("Public studios query failed:", studiosResponse.status, await studiosResponse.text());
      return errorResponse("Не удалось загрузить список клубов.", 503);
    }

    const studios = await studiosResponse.json();
    if (!Array.isArray(studios) || studios.length === 0) {
      return NextResponse.json({ studios: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const settingsUrl = new URL(`${config.url}/rest/v1/studio_booking_settings`);
    settingsUrl.searchParams.set("select", "studio_id,slot_interval_minutes,allowed_durations_minutes,booking_horizon_days,minimum_notice_minutes,allow_same_day_booking");
    settingsUrl.searchParams.set("studio_id", `in.(${studios.map((studio: { id: string }) => studio.id).join(",")})`);

    const settingsResponse = await fetch(settingsUrl, {
      headers: apiHeaders(config.key),
      cache: "no-store",
    });
    if (!settingsResponse.ok) {
      console.error("Public studio settings query failed:", settingsResponse.status, await settingsResponse.text());
      return errorResponse("Не удалось загрузить настройки бронирования.", 503);
    }

    const settingsRows = await settingsResponse.json();
    const settingsByStudio = new Map<string, Record<string, unknown>>(
      (Array.isArray(settingsRows) ? settingsRows : []).map((row: Record<string, unknown>) => [
        String(row.studio_id),
        row,
      ]),
    );

    const result = studios
      .map((studio: Record<string, unknown>) => {
        const settings = settingsByStudio.get(studio.id) as Record<string, unknown> | undefined;
        if (!settings) return null;
        return {
          id: studio.id,
          name: studio.name,
          city_id: studio.city_id,
          address: studio.address,
          timezone: studio.timezone || "Europe/Moscow",
          settings: {
            slot_interval_minutes: Number(settings.slot_interval_minutes),
            allowed_durations_minutes: Array.isArray(settings.allowed_durations_minutes)
              ? settings.allowed_durations_minutes.map(Number).filter((value: number) => Number.isInteger(value) && value >= 15 && value <= 480 && value % 5 === 0)
              : [],
            booking_horizon_days: Number(settings.booking_horizon_days),
            minimum_notice_minutes: Number(settings.minimum_notice_minutes),
            allow_same_day_booking: settings.allow_same_day_booking === true,
          },
        };
      })
      .filter(Boolean);

    return NextResponse.json({ studios: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Public studios API error:", error);
    return errorResponse("Не удалось загрузить список клубов.", 503);
  }
}
