import { NextRequest, NextResponse } from "next/server";
import { getSessionTokenFromRequest, resolveSessionUserId } from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

async function selectRows<T extends Row>(
  url: string,
  key: string,
  table: string,
  params: Record<string, string>,
): Promise<T[]> {
  const target = new URL(`${url}/rest/v1/${table}`);
  for (const [name, value] of Object.entries(params)) target.searchParams.set(name, value);
  const result = await fetch(target, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) throw new Error(`${table} query failed (${result.status}).`);
  const data: unknown = await result.json();
  if (!Array.isArray(data)) throw new Error(`${table} returned an invalid result.`);
  return data as T[];
}

function localDateToUtcMidnight(dateValue: string, timezone: string): string | null {
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const targetUtc = Date.UTC(year, month - 1, day);
  let guess = targetUtc;

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(guess));
      const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
      const localAsUtc = Date.UTC(
        get("year"), get("month") - 1, get("day"),
        get("hour"), get("minute"), get("second"),
      );
      const delta = targetUtc - localAsUtc;
      guess += delta;
      if (delta === 0) break;
    }
    return new Date(guess).toISOString();
  } catch {
    return null;
  }
}

function addCalendarDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const token = getSessionTokenFromRequest(request);
  if (!token) return response({ error: "Войдите в личный кабинет." }, 401);

  const config = getConfig();
  if (!config) return response({ error: "Сервис временно недоступен." }, 503);

  try {
    const userId = await resolveSessionUserId(token);
    if (!userId) return response({ error: "Сессия истекла. Войдите повторно." }, 401);

    const bookings = await selectRows<Row>(config.url, config.key, "bookings", {
      select: "id,funding_method",
      user_id: `eq.${userId}`,
      order: "start_at.desc",
    });

    const bookingIds = bookings.map((row) => String(row.id)).filter(Boolean);
    if (bookingIds.length === 0) return response({ extras: {} });

    const inFilter = `in.(${bookingIds.join(",")})`;
    const [passAllocations, serviceAllocations] = await Promise.all([
      selectRows<Row>(config.url, config.key, "booking_pass_allocations", {
        select: "id,booking_id,user_pass_id,status",
        booking_id: inFilter,
      }),
      selectRows<Row>(config.url, config.key, "booking_services", {
        select: "id,booking_id,service_group_id,allocated_amount_rub,refunded_amount_rub,status",
        booking_id: inFilter,
      }),
    ]);

    const passIds = [...new Set(passAllocations.map((row) => String(row.user_pass_id)).filter(Boolean))];
    const serviceGroupIds = [...new Set(serviceAllocations.map((row) => String(row.service_group_id)).filter(Boolean))];

    const [passes, serviceGroups, serviceRefundOperations] = await Promise.all([
      passIds.length
        ? selectRows<Row>(config.url, config.key, "user_passes", {
            select: "id,city_id,plan_name_snapshot,purchased_at,purchase_local_date,expires_at,timezone_snapshot,remaining_hours,reserved_hours,total_hours,status",
            id: `in.(${passIds.join(",")})`,
            user_id: `eq.${userId}`,
          })
        : Promise.resolve([]),
      serviceGroupIds.length
        ? selectRows<Row>(config.url, config.key, "booking_service_groups", {
            select: "id,service_key,title_snapshot,charge_mode_snapshot,unit_price_rub_snapshot,status",
            id: `in.(${serviceGroupIds.join(",")})`,
          })
        : Promise.resolve([]),
      selectRows<Row>(config.url, config.key, "booking_operations", {
        select: "id,booking_id,status,completed_at,created_at",
        booking_id: inFilter,
        operation_type: "eq.service_refund",
        order: "created_at.desc",
      }),
    ]);

    const operationIds = [...new Set(serviceRefundOperations.map((row) => String(row.id)).filter(Boolean))];
    const refundRows = operationIds.length
      ? await selectRows<Row>(config.url, config.key, "payment_refunds", {
          select: "id,booking_operation_id,status,amount_rub,failure_reason",
          booking_operation_id: `in.(${operationIds.join(",")})`,
        })
      : [];

    const passById = new Map(passes.map((row) => [String(row.id), row]));
    const passAllocationByBooking = new Map(passAllocations.map((row) => [String(row.booking_id), row]));
    const groupById = new Map(serviceGroups.map((row) => [String(row.id), row]));
    const servicesByBooking = new Map<string, Row[]>();
    for (const allocation of serviceAllocations) {
      const bookingId = String(allocation.booking_id);
      const group = groupById.get(String(allocation.service_group_id));
      const current = servicesByBooking.get(bookingId) ?? [];
      current.push({
        id: allocation.id,
        service_key: group?.service_key ?? null,
        title: group?.title_snapshot ?? "Дополнительная услуга",
        charge_mode: group?.charge_mode_snapshot ?? null,
        unit_price_rub: group?.unit_price_rub_snapshot ?? null,
        allocated_amount_rub: allocation.allocated_amount_rub,
        refunded_amount_rub: allocation.refunded_amount_rub,
        status: allocation.status,
      });
      servicesByBooking.set(bookingId, current);
    }

    const operationByBooking = new Map<string, Row>();
    for (const operation of serviceRefundOperations) {
      const bookingId = String(operation.booking_id);
      if (!operationByBooking.has(bookingId)) operationByBooking.set(bookingId, operation);
    }

    const refundByOperation = new Map<string, Row[]>();
    for (const refund of refundRows) {
      const operationId = String(refund.booking_operation_id);
      const current = refundByOperation.get(operationId) ?? [];
      current.push(refund);
      refundByOperation.set(operationId, current);
    }

    const extras: Record<string, Row> = {};
    for (const booking of bookings) {
      const bookingId = String(booking.id);
      const passAllocation = passAllocationByBooking.get(bookingId);
      const pass = passAllocation ? passById.get(String(passAllocation.user_pass_id)) : null;
      const operation = operationByBooking.get(bookingId);
      const refunds = operation ? refundByOperation.get(String(operation.id)) ?? [] : [];
      const serviceRefundState = operation
        ? operation.status === "completed"
          ? "completed"
          : refunds.some((refund) => refund.status === "pending")
            ? "pending"
            : refunds.some((refund) => refund.status === "cancelled" || refund.status === "failed")
              ? "retry_required"
              : "processing"
        : null;

      let passTransferDeadlineAt: string | null = null;
      if (pass?.purchase_local_date && pass.timezone_snapshot) {
        const exclusiveDate = addCalendarDays(String(pass.purchase_local_date), 30);
        const thirtyDayDeadline = localDateToUtcMidnight(exclusiveDate, String(pass.timezone_snapshot));
        const expiryAt = typeof pass.expires_at === "string" ? pass.expires_at : null;
        const deadlineCandidates = [thirtyDayDeadline, expiryAt]
          .filter((value): value is string => Boolean(value))
          .map((value) => ({ value, time: Date.parse(value) }))
          .filter((item) => Number.isFinite(item.time))
          .sort((a, b) => a.time - b.time);
        passTransferDeadlineAt = deadlineCandidates[0]?.value ?? null;
      }

      extras[bookingId] = {
        funding_method: booking.funding_method ?? "cash",
        pass_id: pass?.id ?? null,
        pass_city_id: pass?.city_id ?? null,
        pass_name: pass?.plan_name_snapshot ?? null,
        pass_purchased_at: pass?.purchased_at ?? null,
        pass_purchase_local_date: pass?.purchase_local_date ?? null,
        pass_expires_at: pass?.expires_at ?? null,
        pass_timezone: pass?.timezone_snapshot ?? null,
        pass_remaining_hours: pass?.remaining_hours ?? null,
        pass_reserved_hours: pass?.reserved_hours ?? null,
        pass_allocation_status: passAllocation?.status ?? null,
        transfer_purchase_at: pass?.purchased_at ?? undefined,
        transfer_deadline_at: passTransferDeadlineAt ?? undefined,
        booking_services: servicesByBooking.get(bookingId) ?? [],
        service_refund_state: serviceRefundState,
        service_refund_amount_rub: refunds
          .filter((refund) => refund.status === "pending" || refund.status === "succeeded")
          .reduce((sum, refund) => sum + Number(refund.amount_rub || 0), 0),
        service_refund_failure_reason: refunds.find((refund) => refund.failure_reason)?.failure_reason ?? null,
      };
    }

    return response({ extras });
  } catch (error) {
    console.error("[account-booking-extra] GET failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return response({ error: "Не удалось загрузить детали бронирований." }, 503);
  }
}
