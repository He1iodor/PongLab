import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/app/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  phone: string | null;
  role: string;
  created_at: string;
};

type BookingRow = {
  id: string;
  user_id: string;
  start_at: string;
  end_at: string;
  status: string;
  payment_status: string;
  price_rub: number | string;
  created_at: string;
};

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
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

async function getRows<T>(
  url: string,
  key: string,
  table: string,
  params: Record<string, string>,
): Promise<T[]> {
  const target = new URL(`${url}/rest/v1/${table}`);

  for (const [name, value] of Object.entries(params)) {
    target.searchParams.set(name, value);
  }

  const response = await fetch(target, {
    headers: apiHeaders(key),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    console.error(
      `Admin customers query failed (${table}):`,
      response.status,
      details,
    );
    throw new Error("Не удалось загрузить данные клиентов.");
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("База данных вернула некорректный ответ.");
  }

  return data as T[];
}

/** GET /api/admin/customers — список клиентов и сводка по их броням. */
export async function GET(request: NextRequest) {
  const access = await requireOwner(request);
  if (!access.ok) return access.response;

  const config = getConfig();
  if (!config) {
    return errorResponse("Сервис временно недоступен.", 503);
  }

  try {
    const users = await getRows<UserRow>(
      config.url,
      config.key,
      "users",
      {
        select: "id,phone,role,created_at",
        role: "eq.customer",
        order: "created_at.desc",
        limit: "1000",
      },
    );

    if (users.length === 0) {
      return NextResponse.json(
        { customers: [], limit: 1000 },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const userIds = new Set(users.map((user) => user.id));
    const bookings = await getRows<BookingRow>(
      config.url,
      config.key,
      "bookings",
      {
        select:
          "id,user_id,start_at,end_at,status,payment_status,price_rub,created_at",
        order: "created_at.desc",
        limit: "5000",
      },
    );

    const byUser = new Map<string, BookingRow[]>();
    for (const booking of bookings) {
      if (!userIds.has(booking.user_id)) continue;
      const list = byUser.get(booking.user_id) ?? [];
      list.push(booking);
      byUser.set(booking.user_id, list);
    }

    const customers = users.map((user) => {
      const customerBookings = byUser.get(user.id) ?? [];
      const paidBookings = customerBookings.filter(
        (booking) => booking.payment_status === "succeeded",
      );

      return {
        id: user.id,
        phone: user.phone,
        created_at: user.created_at,
        booking_count: customerBookings.length,
        paid_booking_count: paidBookings.length,
        paid_total_rub: paidBookings.reduce(
          (sum, booking) => sum + Number(booking.price_rub || 0),
          0,
        ),
        last_booking_at: customerBookings[0]?.created_at ?? null,
        bookings: customerBookings.slice(0, 5).map((booking) => ({
          id: booking.id,
          start_at: booking.start_at,
          end_at: booking.end_at,
          status: booking.status,
          payment_status: booking.payment_status,
          price_rub: Number(booking.price_rub || 0),
          created_at: booking.created_at,
        })),
      };
    });

    return NextResponse.json(
      { customers, limit: 1000, booking_history_limit: 5 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Admin customers GET error:", error);
    return errorResponse("Не удалось загрузить клиентов.", 503);
  }
}
