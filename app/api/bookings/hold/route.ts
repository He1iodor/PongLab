import { NextRequest, NextResponse } from "next/server";
import { GET as getAvailability } from "@/app/api/availability/route";
import {
  consumeApiRateLimit,
  createInternalAvailabilityToken,
} from "@/lib/api-rate-limit";
import { createHash } from "node:crypto";
import { isYooKassaReadyForPayments, supabaseRpc } from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AvailableSlot = {
  start_at: string;
  end_at: string;
  duration_minutes: number;
  price_rub: number;
  available_tables: Array<{ id: string; name: string }>;
};

type RequestedGroup = {
  start_at: string;
  duration_minutes: 60;
};

type AdvancedOrderResult = {
  state?: string;
  next_step?: string;
  payment_group_id?: string | null;
  bookings?: Array<{
    id: string;
    start_at: string;
    end_at: string;
    price_rub: number;
    status: string;
    hold_expires_at: string | null;
  }>;
  total_price_rub?: number;
  hold_expires_at?: string | null;
  funding_method?: "cash" | "pass";
  pass_hours_consumed?: number;
  pass_hours_reserved?: number;
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

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function headers(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function readRows(
  url: string,
  key: string,
  table: string,
  query: Record<string, string>,
) {
  const target = new URL(`${url}/rest/v1/${table}`);
  for (const [name, value] of Object.entries(query)) target.searchParams.set(name, value);
  const response = await fetch(target, {
    headers: headers(key),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    console.error(`Booking hold query failed (${table}). HTTP status:`, response.status);
    throw new Error("Не удалось проверить данные бронирования.");
  }
  return response.json();
}

async function expireOldHolds(url: string, key: string, nowIso: string) {
  // Атомарная очистка групповых резервов без начатой инициализации оплаты.
  const groupedResponse = await fetch(`${url}/rest/v1/rpc/expire_unpaid_payment_holds`, {
    method: "POST",
    headers: { ...headers(key), "Content-Type": "application/json" },
    body: JSON.stringify({}),
    cache: "no-store",
  });
  if (!groupedResponse.ok) {
    console.error("Expired grouped payment cleanup failed. HTTP status:", groupedResponse.status);
    throw new Error("Не удалось освободить истёкшие групповые бронирования. Повторите попытку.");
  }

  // Совместимость со старыми бронями без payment_group_id.
  const legacyUrl = new URL(`${url}/rest/v1/bookings`);
  legacyUrl.searchParams.set("status", "eq.pending_payment");
  legacyUrl.searchParams.set("hold_expires_at", `lte.${nowIso}`);
  legacyUrl.searchParams.set("payment_group_id", "is.null");
  legacyUrl.searchParams.set("payment_init_started_at", "is.null");
  legacyUrl.searchParams.set("payment_id", "is.null");

  const legacyResponse = await fetch(legacyUrl, {
    method: "PATCH",
    headers: {
      ...headers(key),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ status: "expired" }),
    cache: "no-store",
  });
  if (!legacyResponse.ok) {
    console.error("Expired legacy booking cleanup failed. HTTP status:", legacyResponse.status);
    throw new Error("Не удалось освободить истёкшие бронирования. Повторите попытку.");
  }
}

function parseRequestedGroups(data: Record<string, unknown>): RequestedGroup[] | null {
  // Каждая запись — ровно один час. table_id от клиента не принимается.
  const rawGroups = Array.isArray(data.groups)
    ? data.groups
    : typeof data.start_at === "string"
      ? [{ start_at: data.start_at, duration_minutes: data.duration_minutes }]
      : null;
  if (!rawGroups || rawGroups.length < 1 || rawGroups.length > 10) return null;

  const groups: RequestedGroup[] = [];
  for (const raw of rawGroups) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    if (
      typeof item.start_at !== "string" ||
      !Number.isFinite(Date.parse(item.start_at)) ||
      item.duration_minutes !== 60
    ) return null;
    groups.push({ start_at: new Date(item.start_at).toISOString(), duration_minutes: 60 });
  }
  return groups;
}

function parseServiceIds(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 2) return null;
  const ids: string[] = [];
  for (const item of value) {
    if (!isUuid(item)) return null;
    if (!ids.includes(item)) ids.push(item);
  }
  return ids;
}

function normalizeAdvancedOrder(value: AdvancedOrderResult) {
  if (!value || !Array.isArray(value.bookings)) return null;
  const bookings = value.bookings.map((row) => ({
    id: row.id,
    start_at: row.start_at,
    end_at: row.end_at,
    price_rub: Number(row.price_rub),
    status: row.status,
    hold_expires_at: row.hold_expires_at ?? null,
  }));
  if (bookings.some((row) => !isUuid(row.id) || !Number.isFinite(Date.parse(row.start_at)) || !Number.isFinite(Date.parse(row.end_at)))) return null;
  const state = typeof value.state === "string" ? value.state : "pending";
  return {
    payment_group_id: isUuid(value.payment_group_id) ? value.payment_group_id : null,
    bookings,
    total_price_rub: Number(value.total_price_rub ?? 0),
    hold_expires_at: value.hold_expires_at ?? null,
    next_step: value.next_step === "confirmed" || state === "confirmed" ? "confirmed" : "payment",
    funding_method: value.funding_method === "pass" ? "pass" : "cash",
    pass_hours_consumed: Number(value.pass_hours_consumed ?? 0),
    pass_hours_reserved: Number(value.pass_hours_reserved ?? 0),
  };
}

async function getExistingAdvancedOrder(
  config: { url: string; key: string },
  userId: string,
  requestKey: string,
) {
  return supabaseRpc<AdvancedOrderResult>("get_customer_booking_order_by_request_key", {
    p_user_id: userId,
    p_request_key: requestKey,
  });
}

export async function POST(request: NextRequest) {
  // Не принимаем запросы с посторонних сайтов.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return errorResponse("Недопустимый запрос.", 403);

  const sessionToken = request.cookies.get("ponglab_session")?.value;
  if (!sessionToken || !/^[a-f0-9]{64}$/i.test(sessionToken)) {
    return errorResponse("Сначала войдите в личный кабинет и подтвердите номер телефона.", 401);
  }

  const config = getConfig();
  if (!config) return errorResponse("Сервис временно недоступен.", 503);

  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("Некорректный запрос.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse("Некорректный запрос.", 400);
  const data = body as Record<string, unknown>;

  const rawCustomerComment = data.customer_comment;
  if (rawCustomerComment !== undefined && rawCustomerComment !== null && typeof rawCustomerComment !== "string") {
    return errorResponse("Некорректный формат комментария.", 400);
  }
  const customerComment = typeof rawCustomerComment === "string" ? rawCustomerComment.trim() : "";
  if ([...customerComment].length > 500) return errorResponse("Комментарий не должен превышать 500 символов.", 400);

  const studioId = data.studio_id;
  const date = data.date;
  const groups = parseRequestedGroups(data);
  if (!isUuid(studioId)) return errorResponse("Не удалось определить клуб.", 400);
  if (!isValidDate(date)) return errorResponse("Укажите корректную дату бронирования.", 400);
  if (!groups) {
    return errorResponse("Переданы некорректные слоты. Каждый слот должен длиться ровно 60 минут. Обновите календарь и попробуйте снова.", 400);
  }
  if (new Set(groups.map((group) => group.start_at)).size !== groups.length) {
    return errorResponse("Один и тот же временной слот выбран несколько раз.", 400);
  }

  if (
    data.funding_method !== undefined &&
    data.funding_method !== "cash" &&
    data.funding_method !== "pass"
  ) {
    return errorResponse("Некорректный способ оплаты.", 400);
  }
  const fundingMethod = data.funding_method === "pass" ? "pass" : "cash";
  const userPassId = data.user_pass_id === undefined || data.user_pass_id === null ? null : data.user_pass_id;
  const serviceIds = parseServiceIds(data.service_ids);
  const requestKey = data.request_key;
  const advancedOrder = isUuid(requestKey) && (fundingMethod === "pass" || (serviceIds !== null && serviceIds.length > 0));

  if (serviceIds === null) return errorResponse("Выбраны некорректные дополнительные услуги.", 400);
  if (fundingMethod === "pass" && !isUuid(userPassId)) return errorResponse("Выберите действующий абонемент.", 400);
  if (fundingMethod === "cash" && userPassId !== null) return errorResponse("Некорректный способ оплаты.", 400);
  if ((fundingMethod === "pass" || serviceIds.length > 0) && !isUuid(requestKey)) {
    return errorResponse("Не удалось подтвердить ключ заказа. Обновите страницу.", 400);
  }

  // Денежный сценарий и услуги требуют готовой YooKassa.
  // Чистое бронирование за абонемент не создаёт денежный платёж.
  if (!(advancedOrder && fundingMethod === "pass" && serviceIds.length === 0) && !isYooKassaReadyForPayments()) {
    return errorResponse("Онлайн-бронирование временно недоступно: приём оплаты ещё не подключён.", 503);
  }

  const tokenHash = createHash("sha256").update(sessionToken).digest("hex");

  try {
    // Получаем пользователя исключительно по действующей серверной сессии.
    const sessions = await readRows(config.url, config.key, "user_sessions", {
      select: "user_id",
      token_hash: `eq.${tokenHash}`,
      expires_at: `gt.${new Date().toISOString()}`,
      limit: "1",
    });
    if (!Array.isArray(sessions) || !sessions[0]?.user_id) {
      return errorResponse("Сессия истекла. Войдите в личный кабинет повторно.", 401);
    }
    const userId = sessions[0].user_id as string;

    const rateLimit = await consumeApiRateLimit({
      supabaseUrl: config.url,
      serviceKey: config.key,
      routeKey: "booking_hold",
      subject: userId,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Слишком много попыток бронирования. Подождите немного и повторите попытку." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(rateLimit.retryAfterSeconds),
            "X-RateLimit-Limit": "5",
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }

    // Повтор того же запроса возвращает уже созданную группу, не создавая новую бронь.
    if (advancedOrder && isUuid(requestKey)) {
      const existing = await getExistingAdvancedOrder(config, userId, requestKey);
      if (existing) {
        if (existing.state === "expired" || existing.state === "cancelled") {
          return errorResponse("Предыдущий резерв истёк. Выберите слоты заново.", 409);
        }
        const normalized = normalizeAdvancedOrder(existing);
        if (!normalized || normalized.bookings.length !== groups.length) {
          return errorResponse("Сервер вернул неполные данные предыдущего заказа.", 503);
        }
        const existingStarts = normalized.bookings.map((booking) => Date.parse(booking.start_at)).sort((a, b) => a - b);
        const requestedStarts = groups.map((group) => Date.parse(group.start_at)).sort((a, b) => a - b);
        if (existingStarts.some((start, index) => start !== requestedStarts[index])) {
          return errorResponse("Ключ предыдущего заказа уже использован для другого выбора слотов. Обновите страницу.", 409);
        }
        return NextResponse.json(normalized, { headers: { "Cache-Control": "no-store" } });
      }
    }

    await expireOldHolds(config.url, config.key, new Date().toISOString());

    const settingsRows = await readRows(config.url, config.key, "studio_booking_settings", {
      select: "hold_minutes",
      studio_id: `eq.${studioId}`,
      limit: "1",
    });
    const settings = Array.isArray(settingsRows) ? settingsRows[0] : null;
    if (!settings) return errorResponse("Настройки бронирования клуба не найдены.", 409);
    const holdMinutes = Number(settings.hold_minutes);
    if (!Number.isInteger(holdMinutes) || holdMinutes < 1 || holdMinutes > 60) {
      return errorResponse("У клуба некорректно настроено время удержания брони.", 503);
    }

    // Для каждого часа сервер повторно проверяет доступность и сам выбирает первый свободный стол.
    const validated: Array<{ table_id: string; start_at: string; end_at: string; price_rub: number }> = [];
    for (const group of groups) {
      const availabilityUrl = new URL("/api/availability", request.url);
      availabilityUrl.searchParams.set("studio_id", studioId);
      availabilityUrl.searchParams.set("date", date);
      availabilityUrl.searchParams.set("duration_minutes", "60");
      const availabilityResponse = await getAvailability(
        new NextRequest(availabilityUrl, {
          headers: { "x-ponglab-internal-availability": createInternalAvailabilityToken(config.key) },
        }),
      );
      const availabilityData = await availabilityResponse.json().catch(() => ({}));
      if (!availabilityResponse.ok) {
        return errorResponse(
          availabilityData.error || "Не удалось проверить доступность слота.",
          availabilityResponse.status,
        );
      }
      const slots = Array.isArray(availabilityData.slots) ? availabilityData.slots as AvailableSlot[] : [];
      const slot = slots.find((candidate) =>
        Date.parse(candidate.start_at) === Date.parse(group.start_at) &&
        Number(candidate.duration_minutes) === 60 &&
        Array.isArray(candidate.available_tables) && candidate.available_tables.length > 0,
      );
      const assignedTable = slot?.available_tables[0];
      if (!slot || !assignedTable?.id) {
        console.error("Booking hold slot is no longer available.");
        return errorResponse("Один из выбранных часовых слотов уже недоступен или тариф изменился. Обновите календарь.", 409);
      }
      validated.push({
        table_id: assignedTable.id,
        start_at: slot.start_at,
        end_at: slot.end_at,
        price_rub: Number(slot.price_rub),
      });
    }

    const holdExpiresAt = new Date(Date.now() + holdMinutes * 60_000).toISOString();

    if (advancedOrder && isUuid(requestKey)) {
      const created = await supabaseRpc<AdvancedOrderResult>("create_customer_booking_order", {
        p_user_id: userId,
        p_provider: "yookassa",
        p_hold_expires_at: holdExpiresAt,
        p_bookings: validated,
        p_customer_comment: customerComment || null,
        p_funding_method: fundingMethod,
        p_user_pass_id: isUuid(userPassId) ? userPassId : null,
        p_service_ids: serviceIds,
        p_request_key: requestKey,
      });
      if (!created || typeof created.state !== "string") {
        return errorResponse("Не удалось создать заказ бронирования.", 503);
      }
      if (created.state === "expired" || created.state === "cancelled") {
        return errorResponse("Предыдущий резерв истёк. Выберите слоты заново.", 409);
      }
      const normalized = normalizeAdvancedOrder(created);
      if (!normalized || normalized.bookings.length !== validated.length) {
        return errorResponse("Сервер не подтвердил создание всей группы бронирования.", 503);
      }
      return NextResponse.json(normalized, {
        status: created.state === "confirmed" ? 201 : 201,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Существующий денежный сценарий оставлен без изменений.
    const rpcResponse = await fetch(`${config.url}/rest/v1/rpc/create_payment_group_with_bookings`, {
      method: "POST",
      headers: {
        ...headers(config.key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_provider: "yookassa",
        p_hold_expires_at: holdExpiresAt,
        p_bookings: validated.map((item) => ({
          table_id: item.table_id,
          start_at: item.start_at,
          end_at: item.end_at,
          price_rub: item.price_rub,
        })),
        p_customer_comment: customerComment || null,
      }),
      cache: "no-store",
    });

    if (!rpcResponse.ok) {
      const details = await rpcResponse.text();
      console.error("Atomic payment group creation failed. HTTP status:", rpcResponse.status);
      if (rpcResponse.status === 409 || details.includes("bookings_no_overlap") || details.includes("23P01")) {
        return errorResponse("Кто-то успел занять один из выбранных периодов. Обновите календарь и выберите другое время.", 409);
      }
      return errorResponse("Не удалось создать группу бронирования. Повторите попытку.", 503);
    }

    const createdGroup = await rpcResponse.json().catch(() => null);
    if (
      !createdGroup || typeof createdGroup !== "object" ||
      !createdGroup.payment_group_id || !Array.isArray(createdGroup.bookings) ||
      createdGroup.bookings.length !== validated.length || Number(createdGroup.total_price_rub) <= 0
    ) {
      console.error("Atomic payment group creation returned an unexpected response.", {
        hasPaymentGroupId: Boolean(createdGroup?.payment_group_id),
        bookingsIsArray: Array.isArray(createdGroup?.bookings),
        bookingCount: Array.isArray(createdGroup?.bookings) ? createdGroup.bookings.length : null,
        hasPositiveTotal: Number.isFinite(Number(createdGroup?.total_price_rub)) && Number(createdGroup.total_price_rub) > 0,
      });
      return errorResponse("Сервер не подтвердил создание всей группы бронирования.", 503);
    }

    const bookings = createdGroup.bookings.map((row: {
      id: string; start_at: string; end_at: string; price_rub: number; status: string; hold_expires_at: string;
    }) => ({
      id: row.id,
      start_at: row.start_at,
      end_at: row.end_at,
      price_rub: row.price_rub,
      status: row.status,
      hold_expires_at: row.hold_expires_at,
    }));

    return NextResponse.json(
      {
        payment_group_id: createdGroup.payment_group_id,
        bookings,
        total_price_rub: Number(createdGroup.total_price_rub),
        hold_expires_at: createdGroup.hold_expires_at ?? holdExpiresAt,
        next_step: "payment",
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Booking hold POST failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse("Не удалось создать временную бронь. Попробуйте позже.", 503);
  }
}
