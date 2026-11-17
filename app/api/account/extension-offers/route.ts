import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTokenFromRequest,
  resolveSessionUserId,
} from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OperationRow = {
  id: string;
  booking_id: string;
  status: string;
  operation_type: string;
  target_table_id: string;
  target_start_at: string;
  target_end_at: string;
  source_end_at: string;
  price_difference_rub: number;
  expires_at: string | null;
  adjustment_payment_group_id: string | null;
  metadata: Record<string, unknown> | null;
};

type BookingRow = {
  id: string;
  table_id: string;
  start_at: string;
  end_at: string;
  status: string;
  payment_status: string;
};

type TableRow = { id: string; name: string; studio_id: string };
type StudioRow = { id: string; name: string; timezone: string | null };

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function headers(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function getRows<T>(
  url: string,
  key: string,
  table: string,
  query: Record<string, string>,
): Promise<T[]> {
  const target = new URL(`${url}/rest/v1/${table}`);
  for (const [name, value] of Object.entries(query)) target.searchParams.set(name, value);

  const response = await fetch(target, {
    headers: headers(key),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Supabase query failed (${table}).`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error("Invalid Supabase response.");
  return rows as T[];
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export async function GET(request: NextRequest) {
  const token = getSessionTokenFromRequest(request);
  if (!token) return errorResponse("Войдите в личный кабинет.", 401);

  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);

  try {
    const userId = await resolveSessionUserId(token);
    if (!userId) return errorResponse("Сессия истекла. Войдите повторно.", 401);

    const now = new Date().toISOString();
    const operations = await getRows<OperationRow>(
      config.url,
      config.key,
      "booking_operations",
      {
        select: "id,booking_id,status,operation_type,target_table_id,target_start_at,target_end_at,source_end_at,price_difference_rub,expires_at,adjustment_payment_group_id,metadata",
        user_id: `eq.${userId}`,
        operation_type: "eq.extension_offer",
        status: "in.(offered,awaiting_payment)",
        expires_at: `gt.${now}`,
        order: "created_at.asc",
        limit: "20",
      },
    );

    if (operations.length === 0) {
      return NextResponse.json({ offers: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const bookingIds = unique(operations.map((item) => item.booking_id));
    const tableIds = unique(operations.map((item) => item.target_table_id));
    const bookings = await getRows<BookingRow>(
      config.url,
      config.key,
      "bookings",
      {
        select: "id,table_id,start_at,end_at,status,payment_status",
        id: `in.(${bookingIds.join(",")})`,
        user_id: `eq.${userId}`,
      },
    );
    const tables = await getRows<TableRow>(
      config.url,
      config.key,
      "studio_tables",
      { select: "id,name,studio_id", id: `in.(${tableIds.join(",")})` },
    );
    const studioIds = unique(tables.map((item) => item.studio_id));
    const studios = studioIds.length
      ? await getRows<StudioRow>(
          config.url,
          config.key,
          "studios",
          { select: "id,name,timezone", id: `in.(${studioIds.join(",")})` },
        )
      : [];

    const bookingById = new Map(bookings.map((item) => [item.id, item]));
    const tableById = new Map(tables.map((item) => [item.id, item]));
    const studioById = new Map(studios.map((item) => [item.id, item]));

    const offers = operations.flatMap((operation) => {
      const booking = bookingById.get(operation.booking_id);
      const table = tableById.get(operation.target_table_id);
      const studio = table ? studioById.get(table.studio_id) : undefined;

      if (
        !booking ||
        !table ||
        !studio ||
        booking.status !== "confirmed" ||
        booking.payment_status !== "succeeded" ||
        booking.end_at !== operation.source_end_at
      ) return [];

      const metadata = operation.metadata ?? {};
      return [{
        id: operation.id,
        status: operation.status,
        booking_id: operation.booking_id,
        table_name: table.name,
        studio_name: studio.name,
        timezone: studio.timezone || "Europe/Moscow",
        source_end_at: operation.source_end_at,
        target_end_at: operation.target_end_at,
        amount_rub: operation.price_difference_rub,
        base_price_rub: typeof metadata.base_price_rub === "number" ? metadata.base_price_rub : null,
        discount_percent: typeof metadata.discount_percent === "number" ? metadata.discount_percent : null,
        expires_at: operation.expires_at,
        payment_group_id: operation.adjustment_payment_group_id,
      }];
    });

    return NextResponse.json({ offers }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Account extension offers GET failed:", error);
    return errorResponse("Не удалось загрузить предложения продления.", 503);
  }
}
