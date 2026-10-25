
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StudioRow = {
  id: string;
  name: string;
  city_id: string | null;
  address: string | null;
  timezone: string | null;
};

type StudioSettingsRow = {
  studio_id: string;
  slot_interval_minutes: unknown;
  allowed_durations_minutes: unknown;
  booking_horizon_days: unknown;
  minimum_notice_minutes: unknown;
  allow_same_day_booking: unknown;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;

  return url && key ? { url, key } : null;
}

function apiHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStudioRow(value: unknown): value is StudioRow {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (typeof value.city_id === "string" || value.city_id === null) &&
    (typeof value.address === "string" || value.address === null) &&
    (typeof value.timezone === "string" || value.timezone === null)
  );
}

function isStudioSettingsRow(
  value: unknown,
): value is StudioSettingsRow {
  return isRecord(value) && typeof value.studio_id === "string";
}

function validDurations(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(Number)
    .filter(
      (duration: number) =>
        Number.isInteger(duration) &&
        duration >= 15 &&
        duration <= 480 &&
        duration % 5 === 0,
    );
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : fallback;
}

export async function GET() {
  const config = getConfig();

  if (!config) {
    return errorResponse("Сервис временно недоступен.", 503);
  }

  try {
    const studiosUrl = new URL(`${config.url}/rest/v1/studios`);

    studiosUrl.searchParams.set(
      "select",
      "id,name,city_id,address,timezone",
    );
    studiosUrl.searchParams.set("is_active", "eq.true");
    studiosUrl.searchParams.set("order", "name.asc");

    const studiosResponse = await fetch(studiosUrl, {
      headers: apiHeaders(config.key),
      cache: "no-store",
    });

    if (!studiosResponse.ok) {
      console.error(
        "Public studios query failed:",
        studiosResponse.status,
        await studiosResponse.text(),
      );

      return errorResponse("Не удалось загрузить список клубов.", 503);
    }

    const studiosData: unknown = await studiosResponse.json();

    if (!Array.isArray(studiosData)) {
      console.error("Public studios query returned an invalid response.");
      return errorResponse("Получен некорректный список клубов.", 503);
    }

    const studios: StudioRow[] = studiosData.filter(isStudioRow);

    if (studios.length === 0) {
      return NextResponse.json(
        { studios: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const settingsUrl = new URL(
      `${config.url}/rest/v1/studio_booking_settings`,
    );

    settingsUrl.searchParams.set(
      "select",
      [
        "studio_id",
        "slot_interval_minutes",
        "allowed_durations_minutes",
        "booking_horizon_days",
        "minimum_notice_minutes",
        "allow_same_day_booking",
      ].join(","),
    );

    const studioIds = studios.map((studio) => studio.id);

    settingsUrl.searchParams.set(
      "studio_id",
      `in.(${studioIds.join(",")})`,
    );

    const settingsResponse = await fetch(settingsUrl, {
      headers: apiHeaders(config.key),
      cache: "no-store",
    });

    if (!settingsResponse.ok) {
      console.error(
        "Public studio settings query failed:",
        settingsResponse.status,
        await settingsResponse.text(),
      );

      return errorResponse(
        "Не удалось загрузить настройки бронирования.",
        503,
      );
    }

    const settingsData: unknown = await settingsResponse.json();

    if (!Array.isArray(settingsData)) {
      console.error(
        "Public studio settings query returned an invalid response.",
      );

      return errorResponse(
        "Получен некорректный ответ настроек бронирования.",
        503,
      );
    }

    const settingsRows: StudioSettingsRow[] =
      settingsData.filter(isStudioSettingsRow);

    const settingsByStudio = new Map<string, StudioSettingsRow>(
      settingsRows.map((row) => [row.studio_id, row]),
    );

    const result = studios
      .map((studio) => {
        const settings = settingsByStudio.get(studio.id);

        if (!settings) return null;

        return {
          id: studio.id,
          name: studio.name,
          city_id: studio.city_id,
          address: studio.address,
          timezone: studio.timezone || "Europe/Moscow",
          settings: {
            slot_interval_minutes: positiveInteger(
              settings.slot_interval_minutes,
              15,
            ),
            allowed_durations_minutes: validDurations(
              settings.allowed_durations_minutes,
            ),
            booking_horizon_days: positiveInteger(
              settings.booking_horizon_days,
              30,
            ),
            minimum_notice_minutes: nonNegativeInteger(
              settings.minimum_notice_minutes,
              0,
            ),
            allow_same_day_booking:
              settings.allow_same_day_booking === true,
          },
        };
      })
      .filter((studio) => studio !== null);

    return NextResponse.json(
      { studios: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Public studios API error:", error);

    return errorResponse("Не удалось загрузить список клубов.", 503);
  }
}
