import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingRow = {
  id: string;
  table_id: string;
  start_at: string;
  end_at: string;
  status: string;
  payment_status: string;
  price_rub: number;
  payment_init_started_at: string | null;
  payment_id: string | null;
  payment_group_id: string | null;
  hold_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type TableRow = { id: string; name: string; studio_id: string };
type StudioRow = { id: string; name: string; address: string | null; timezone: string | null };
type DeviceRow = {
  id: string;
  studio_id: string;
  door_state: "open" | "closed" | "unknown";
  last_seen_at: string | null;
};
type FailureRow = { payment_group_id: string; failure_reason: string | null };

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

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function apiHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function getRows<T>(
  url: string,
  key: string,
  table: string,
  query: Record<string, string>,
): Promise<T[]> {
  const target = new URL(`${url}/rest/v1/${table}`);
  for (const [name, value] of Object.entries(query)) {
    target.searchParams.set(name, value);
  }

  const response = await fetch(target, {
    headers: apiHeaders(key),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    console.error(`Account bookings query failed (${table}):`, response.status, await response.text());
    throw new Error("Не удалось загрузить бронирования.");
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("Получен некорректный ответ базы данных.");
  return data as T[];
}

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get("ponglab_session")?.value;
  if (!sessionToken || !/^[a-f0-9]{64}$/i.test(sessionToken)) {
    return errorResponse("Войдите в личный кабинет, чтобы просмотреть бронирования.", 401);
  }

  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);

  try {
    const sessions = await getRows<{ user_id: string }>(
      config.url,
      config.key,
      "user_sessions",
      {
        select: "user_id",
        token_hash: `eq.${hashToken(sessionToken)}`,
        expires_at: `gt.${new Date().toISOString()}`,
        limit: "1",
      },
    );

    const userId = sessions[0]?.user_id;
    if (!userId) {
      const response = NextResponse.json(
        { error: "Сессия истекла. Войдите в личный кабинет повторно." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
      response.cookies.set("ponglab_session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return response;
    }

    const rows = await getRows<BookingRow>(
      config.url,
      config.key,
      "bookings",
      {
        select: "id,table_id,start_at,end_at,status,payment_status,price_rub,payment_init_started_at,payment_id,payment_group_id,hold_expires_at,created_at,updated_at",
        user_id: `eq.${userId}`,
        order: "start_at.desc",
        limit: "100",
      },
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { bookings: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const tableIds = [...new Set(rows.map((booking) => booking.table_id))];
    const tables = await getRows<TableRow>(
      config.url,
      config.key,
      "studio_tables",
      {
        select: "id,name,studio_id",
        id: `in.(${tableIds.join(",")})`,
      },
    );

    const tableById = new Map(tables.map((table) => [table.id, table]));
    const studioIds = [...new Set(tables.map((table) => table.studio_id))];

    const studios = studioIds.length
      ? await getRows<StudioRow>(
          config.url,
          config.key,
          "studios",
          {
            select: "id,name,address,timezone",
            id: `in.(${studioIds.join(",")})`,
          },
        )
      : [];

    const studioById = new Map(studios.map((studio) => [studio.id, studio]));

    // A door controller is valid for this endpoint only when the studio has
    // exactly one active door device. This matches the existing unlock API.
    const devices = studioIds.length
      ? await getRows<DeviceRow>(
          config.url,
          config.key,
          "access_devices",
          {
            select: "id,studio_id,door_state,last_seen_at",
            studio_id: `in.(${studioIds.join(",")})`,
            device_type: "eq.door",
            status: "eq.active",
            limit: "500",
          },
        )
      : [];

    const devicesByStudio = new Map<string, DeviceRow[]>();
    for (const device of devices) {
      const list = devicesByStudio.get(device.studio_id) ?? [];
      list.push(device);
      devicesByStudio.set(device.studio_id, list);
    }

    // Payment failure reasons are read through an owner-scoped RPC. If the
    // migration has not been applied yet, the bookings list still remains usable.
    const paymentGroupIds = [
      ...new Set(
        rows
          .map((booking) => booking.payment_group_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const failureByGroup = new Map<string, string | null>();

    if (paymentGroupIds.length > 0) {
      try {
        const failureResponse = await fetch(
          `${config.url}/rest/v1/rpc/get_account_payment_failure_reasons`,
          {
            method: "POST",
            headers: {
              ...apiHeaders(config.key),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              p_user_id: userId,
              p_payment_group_ids: paymentGroupIds,
            }),
            cache: "no-store",
            signal: AbortSignal.timeout(10000),
          },
        );

        if (failureResponse.ok) {
          const failures = (await failureResponse.json()) as FailureRow[];
          if (Array.isArray(failures)) {
            for (const failure of failures) {
              failureByGroup.set(failure.payment_group_id, failure.failure_reason);
            }
          }
        } else {
          console.warn("Account payment failure RPC unavailable:", failureResponse.status);
        }
      } catch (error) {
        console.warn("Account payment failure RPC request failed:", error);
      }
    }

    const now = Date.now();

    const bookings = rows.map((booking) => {
      const table = tableById.get(booking.table_id);
      const studio = table ? studioById.get(table.studio_id) : undefined;
      const paymentInProgress =
        booking.status === "pending_payment" &&
        Boolean(booking.payment_init_started_at || booking.payment_id);

      const holdExpired =
        !paymentInProgress &&
        booking.status === "pending_payment" &&
        Boolean(booking.hold_expires_at) &&
        Date.parse(booking.hold_expires_at as string) <= now;

      const studioDevices = studio ? devicesByStudio.get(studio.id) ?? [] : [];
      const doorDevice = studioDevices.length === 1 ? studioDevices[0] : null;
      const lastSeenMs = doorDevice?.last_seen_at
        ? Date.parse(doorDevice.last_seen_at)
        : Number.NaN;
      const doorOnline =
        Number.isFinite(lastSeenMs) &&
        lastSeenMs <= now &&
        now - lastSeenMs <= 45_000;

      return {
        id: booking.id,
        start_at: booking.start_at,
        end_at: booking.end_at,
        status: booking.status,
        effective_status: holdExpired ? "expired" : booking.status,
        payment_status: booking.payment_status,
        payment_failure_reason: booking.payment_group_id
          ? failureByGroup.get(booking.payment_group_id) ?? null
          : null,
        price_rub: booking.price_rub,
        payment_init_started_at: booking.payment_init_started_at,
        payment_id: booking.payment_id,
        payment_group_id: booking.payment_group_id,
        hold_expires_at: booking.hold_expires_at,
        created_at: booking.created_at,
        table_id: booking.table_id,
        table_name: table?.name ?? "Стол",
        studio_id: table?.studio_id ?? null,
        studio_name: studio?.name ?? "PongLab",
        studio_address: studio?.address ?? null,
        timezone: studio?.timezone || "Europe/Moscow",
        door_controller_available: Boolean(doorDevice),
        door_controller_online: Boolean(doorDevice) && doorOnline,
        door_state: doorDevice?.door_state ?? null,
        door_last_seen_at: doorDevice?.last_seen_at ?? null,
      };
    });

    return NextResponse.json(
      { bookings },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Account bookings GET error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Не удалось загрузить бронирования.",
      503,
    );
  }
}
