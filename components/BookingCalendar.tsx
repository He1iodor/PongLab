"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock3,
  MapPin,
  RefreshCw,
  CheckCircle2,
  WalletCards,
  Info,
  X,
} from "lucide-react";

type Studio = {
  id: string;
  name: string;
  address: string | null;
  city_id: string;
  timezone: string;
  settings: {
    slot_interval_minutes: number;
    allowed_durations_minutes: number[];
    booking_horizon_days: number;
    minimum_notice_minutes: number;
    allow_same_day_booking: boolean;
  };
};

type AvailableTable = { id: string; name: string };

type Slot = {
  start_at: string;
  end_at: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  price_rub: number;
  available_tables: AvailableTable[];
};

type SelectedSlot = { key: string };

type PassOption = {
  id: string;
  city_id: string;
  city_name: string;
  plan_name_snapshot: string;
  total_hours: number;
  remaining_hours: number;
  reserved_hours: number;
  status: string;
  expires_at: string | null;
  timezone_snapshot: string | null;
};

type StudioService = {
  id: string;
  studio_id: string;
  service_key: "joint_play" | "coach_session";
  title: string;
  description: string | null;
  price_rub: number;
  charge_mode: "per_slot" | "per_group";
  availability_rules: {
    weekdays?: number[];
    date_ranges?: Array<{ from: string; to: string }>;
    time_intervals?: Array<{ starts_at: string; ends_at: string }>;
  };
};

type HoldResult = {
  payment_group_id: string | null;
  next_step?: "payment" | "confirmed";
  funding_method?: "cash" | "pass";
  bookings: Array<{
    id: string;
    start_at: string;
    end_at: string;
    price_rub: number;
    hold_expires_at: string | null;
  }>;
  total_price_rub: number;
  hold_expires_at: string | null;
  pass_hours_consumed?: number;
  pass_hours_reserved?: number;
};

type BookingGroup = {
  slot: Slot;
  start_at: string;
  end_at: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: 60;
  price_rub: number;
};

type BookingDraft = {
  version: 1;
  saved_at: number;
  studio_id: string;
  date: string;
  selected_slot_keys: string[];
  customer_comment: string;
  offer_accepted: boolean;
  hold_result?: HoldResult | null;
  funding_method?: "cash" | "pass";
  selected_pass_id?: string;
  selected_service_ids?: string[];
  request_key?: string;
};

const BOOKING_DRAFT_KEY = "ponglab_booking_draft_v1";
const BOOKING_DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

function clearBookingDraft() {
  try {
    window.sessionStorage.removeItem(BOOKING_DRAFT_KEY);
  } catch {
    // Хранилище необязательно и не должно блокировать оплату.
  }
}

function isValidHoldResult(value: unknown): value is HoldResult {
  if (!value || typeof value !== "object") return false;
  const hold = value as Partial<HoldResult>;
  if (
    !Array.isArray(hold.bookings) ||
    hold.bookings.length === 0 ||
    !hold.bookings.every(
      (booking) =>
        booking &&
        typeof booking.id === "string" &&
        typeof booking.start_at === "string" &&
        typeof booking.end_at === "string" &&
        Number.isFinite(booking.price_rub),
    ) ||
    !Number.isFinite(hold.total_price_rub)
  ) return false;

  const nextStep = hold.next_step ?? "payment";
  if (nextStep === "confirmed") {
    return (
      hold.payment_group_id === null &&
      hold.funding_method === "pass" &&
      hold.total_price_rub === 0
    );
  }

  const expiresAt = Date.parse(String(hold.hold_expires_at ?? ""));
  return (
    nextStep === "payment" &&
    typeof hold.payment_group_id === "string" &&
    hold.payment_group_id.length > 0 &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now()
  );
}

function dateInTimezone(timezone: string, offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (name: string) =>
    parts.find((part) => part.type === name)?.value ?? "";

  const base = new Date(
    Date.UTC(
      Number(get("year")),
      Number(get("month")) - 1,
      Number(get("day")) + offsetDays,
    ),
  );

  return base.toISOString().slice(0, 10);
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}


function localParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

function isServiceAvailableForSlot(service: StudioService, startAt: string, timezone: string) {
  const start = new Date(startAt);
  if (!Number.isFinite(start.getTime())) return false;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const localStart = localParts(start, timezone);
  const localEnd = localParts(end, timezone);
  if (localStart.date !== localEnd.date) return false;

  const rules = service.availability_rules || {};
  const weekdayText = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone }).format(start);
  const weekday = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[weekdayText];
  const days = Array.isArray(rules.weekdays) ? rules.weekdays : [];
  if (days.length > 0 && !days.includes(weekday)) return false;

  const dateRanges = Array.isArray(rules.date_ranges) ? rules.date_ranges : [];
  if (dateRanges.length > 0 && !dateRanges.some((range) => localStart.date >= range.from && localStart.date <= range.to)) return false;

  const intervals = Array.isArray(rules.time_intervals) ? rules.time_intervals : [];
  if (intervals.length > 0 && !intervals.some((interval) => interval.starts_at <= localStart.time && interval.ends_at >= localEnd.time)) return false;

  return true;
}

function formatPassExpiry(value: string | null, timezone: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  // expires_at хранит начало следующего дня: показываем последний действующий день.
  date.setTime(date.getTime() - 1);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone || "Europe/Moscow",
  }).format(date);
}

export default function BookingCalendar({
  returnTo = "/booking",
}: {
  returnTo?: string;
}) {
  const [studios, setStudios] = useState<Studio[]>([]);
  const [studioId, setStudioId] = useState("");
  const [date, setDate] = useState("");
  const duration = 60;
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([]);
  const [selectionError, setSelectionError] = useState("");
  const [loadingStudios, setLoadingStudios] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [offerAccepted, setOfferAccepted] = useState(false);
  const [customerComment, setCustomerComment] = useState("");
  const [creatingHold, setCreatingHold] = useState(false);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [holdError, setHoldError] = useState("");
  const [holdResult, setHoldResult] = useState<HoldResult | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [fundingMethod, setFundingMethod] = useState<"cash" | "pass">("cash");
  const [passes, setPasses] = useState<PassOption[]>([]);
  const [services, setServices] = useState<StudioService[]>([]);
  const [selectedPassId, setSelectedPassId] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [bookingRequestKey, setBookingRequestKey] = useState("");
  const [loadingPasses, setLoadingPasses] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);
  const [serviceInfo, setServiceInfo] = useState<StudioService | null>(null);
  const [confirmedMessage, setConfirmedMessage] = useState("");
  const selectionInitialized = useRef(false);

  void returnTo;

  const selectedStudio = useMemo(
    () => studios.find((studio) => studio.id === studioId) ?? null,
    [studios, studioId],
  );

  const resolvedSelectedSlots = useMemo(
    () =>
      selectedSlots
        .map((selection) => ({
          selection,
          slot: slots.find(
            (slot) =>
              `${slot.start_at}|${slot.duration_minutes}` === selection.key,
          ),
        }))
        .filter(
          (item): item is { selection: SelectedSlot; slot: Slot } =>
            Boolean(item.slot),
        )
        .sort((a, b) => a.slot.start_at.localeCompare(b.slot.start_at)),
    [slots, selectedSlots],
  );

  // Каждый выбранный час становится отдельной бронью на 60 минут.
  // Стол назначается сервером при создании резерва.
  const bookingGroups = useMemo(
    () =>
      resolvedSelectedSlots.map(({ slot }) => ({
        slot,
        start_at: slot.start_at,
        end_at: slot.end_at,
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
        duration_minutes: 60 as const,
        price_rub: slot.price_rub,
      })),
    [resolvedSelectedSlots],
  );

  const totalPrice = bookingGroups.reduce(
    (total, group) => total + group.price_rub,
    0,
  );

  const cityPasses = useMemo(() => {
    const now = Date.now();
    return passes.filter((pass) =>
      pass.city_id === selectedStudio?.city_id &&
      pass.status === "active" &&
      pass.remaining_hours > 0 &&
      (!pass.expires_at || Date.parse(pass.expires_at) > now),
    );
  }, [passes, selectedStudio]);

  const selectedPass = cityPasses.find((pass) => pass.id === selectedPassId) ?? null;

  useEffect(() => {
    if (fundingMethod !== "pass" || cityPasses.length === 0) return;
    if (!cityPasses.some((pass) => pass.id === selectedPassId)) {
      setSelectedPassId(cityPasses[0].id);
    }
  }, [fundingMethod, cityPasses, selectedPassId]);
  const selectedServices = services.filter((service) => selectedServiceIds.includes(service.id));
  const unavailableService = selectedServices.find((service) =>
    bookingGroups.some((group) => !isServiceAvailableForSlot(service, group.start_at, selectedStudio?.timezone || "Europe/Moscow")),
  );
  const serviceTotal = selectedServices.reduce((sum, service) =>
    sum + (service.charge_mode === "per_slot" ? service.price_rub * bookingGroups.length : service.price_rub), 0,
  );
  const slotAmountDue = fundingMethod === "pass" ? 0 : totalPrice;
  const totalAmountDue = slotAmountDue + serviceTotal;
  const passHoursNeeded = bookingGroups.length;
  const passAvailableHours = selectedPass
    ? Math.max(0, selectedPass.remaining_hours)
    : 0;
  const passInsufficient = fundingMethod === "pass" && (!selectedPass || passAvailableHours < passHoursNeeded);

  const hasUnavailableSelectedSlots =
    selectedSlots.length !== resolvedSelectedSlots.length ||
    resolvedSelectedSlots.some(
      ({ slot }) => slot.available_tables.length === 0,
    );

  const maxDate = selectedStudio
    ? dateInTimezone(
        selectedStudio.timezone,
        selectedStudio.settings.booking_horizon_days,
      )
    : "";

  const minDate =
    selectedStudio && !selectedStudio.settings.allow_same_day_booking
      ? dateInTimezone(selectedStudio.timezone, 1)
      : selectedStudio
        ? dateInTimezone(selectedStudio.timezone)
        : "";

  // Восстанавливаем черновик до загрузки доступности.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(BOOKING_DRAFT_KEY);

      if (raw) {
        const parsed = JSON.parse(raw) as Partial<BookingDraft>;
        const savedAt = Number(parsed.saved_at);
        const age = Date.now() - savedAt;

        if (
          parsed.version === 1 &&
          Number.isFinite(savedAt) &&
          age >= 0 &&
          age <= BOOKING_DRAFT_TTL_MS
        ) {
          setStudioId(
            typeof parsed.studio_id === "string" ? parsed.studio_id : "",
          );

          setDate(
            typeof parsed.date === "string" ? parsed.date : "",
          );

          const restoredKeys = Array.isArray(parsed.selected_slot_keys)
            ? parsed.selected_slot_keys
                .filter(
                  (key): key is string => typeof key === "string",
                )
                .slice(0, 10)
            : [];

          setSelectedSlots(
            restoredKeys.map((key) => ({ key })),
          );

          setCustomerComment(
            typeof parsed.customer_comment === "string"
              ? parsed.customer_comment.slice(0, 500)
              : "",
          );

          setOfferAccepted(parsed.offer_accepted === true);

          setFundingMethod(parsed.funding_method === "pass" ? "pass" : "cash");
          setSelectedPassId(typeof parsed.selected_pass_id === "string" ? parsed.selected_pass_id : "");
          setSelectedServiceIds(Array.isArray(parsed.selected_service_ids) ? parsed.selected_service_ids.filter((id): id is string => typeof id === "string").slice(0, 2) : []);
          setBookingRequestKey(typeof parsed.request_key === "string" ? parsed.request_key : "");

          if (isValidHoldResult(parsed.hold_result)) {
            setHoldResult(parsed.hold_result);
          }
        } else {
          window.sessionStorage.removeItem(BOOKING_DRAFT_KEY);
        }
      }
    } catch {
      try {
        window.sessionStorage.removeItem(BOOKING_DRAFT_KEY);
      } catch {
        // Если хранилище недоступно, бронирование продолжает работать.
      }
    } finally {
      setDraftRestored(true);
    }
  }, []);

  // Сохраняем состояние выбора и активный резерв при переходах между страницами.
  useEffect(() => {
    if (!draftRestored) return;

    try {
      if (
        !studioId &&
        !date &&
        selectedSlots.length === 0 &&
        !customerComment &&
        !offerAccepted &&
        !holdResult
      ) {
        window.sessionStorage.removeItem(BOOKING_DRAFT_KEY);
        return;
      }

      const draft: BookingDraft = {
        version: 1,
        saved_at: Date.now(),
        studio_id: studioId,
        date,
        selected_slot_keys: selectedSlots.map(
          (selection) => selection.key,
        ),
        customer_comment: customerComment,
        offer_accepted: offerAccepted,
        hold_result:
          holdResult && isValidHoldResult(holdResult)
            ? holdResult
            : null,
        funding_method: fundingMethod,
        selected_pass_id: selectedPassId,
        selected_service_ids: selectedServiceIds,
        request_key: bookingRequestKey || undefined,
      };

      window.sessionStorage.setItem(
        BOOKING_DRAFT_KEY,
        JSON.stringify(draft),
      );
    } catch {
      // Ошибка хранилища не должна блокировать бронирование.
    }
  }, [
    draftRestored,
    studioId,
    date,
    selectedSlots,
    customerComment,
    offerAccepted,
    holdResult,
    fundingMethod,
    selectedPassId,
    selectedServiceIds,
    bookingRequestKey,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadStudios() {
      setLoadingStudios(true);
      setError("");

      try {
        const response = await fetch("/api/studios", {
          cache: "no-store",
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            result.error || "Не удалось загрузить клубы.",
          );
        }

        const items = Array.isArray(result.studios)
          ? (result.studios as Studio[])
          : [];

        if (cancelled) return;

        setStudios(items);

        if (items.length > 0) {
          const first = items[0];

          setStudioId((current) =>
            items.some((item) => item.id === current)
              ? current
              : first.id,
          );

          setDate(
            (current) => current || dateInTimezone(first.timezone),
          );
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Не удалось загрузить клубы.",
          );
        }
      } finally {
        if (!cancelled) setLoadingStudios(false);
      }
    }

    void loadStudios();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setLoadingPasses(true);
    fetch("/api/account/passes", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) return [];
        return Array.isArray(result.passes) ? (result.passes as PassOption[]) : [];
      })
      .then((items) => {
        if (!cancelled) setPasses(items);
      })
      .catch(() => {
        if (!cancelled) setPasses([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPasses(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!studioId) {
      setServices([]);
      setSelectedServiceIds([]);
      return;
    }
    let cancelled = false;
    setLoadingServices(true);
    const params = new URLSearchParams({ studio_id: studioId });
    fetch(`/api/studios/services?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Не удалось загрузить услуги.");
        return Array.isArray(result.services) ? (result.services as StudioService[]) : [];
      })
      .then((items) => {
        if (cancelled) return;
        setServices(items);
        setSelectedServiceIds((current) => {
          const filtered = current.filter((id) => items.some((item) => item.id === id));
          return filtered.length === current.length ? current : filtered;
        });
      })
      .catch(() => {
        if (!cancelled) setServices([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingServices(false);
      });
    return () => { cancelled = true; };
  }, [studioId]);

  useEffect(() => {
    if (!draftRestored) return;
    if (!selectionInitialized.current) {
      selectionInitialized.current = true;
      return;
    }
    setBookingRequestKey("");
    setConfirmedMessage("");
  }, [draftRestored, studioId, date, selectedSlots, fundingMethod, selectedPassId, selectedServiceIds]);

  useEffect(() => {
    if (!studioId || !date) return;

    let cancelled = false;

    async function loadSlots() {
      setLoadingSlots(true);
      setError("");
      setSelectionError("");

      try {
        const params = new URLSearchParams({
          studio_id: studioId,
          date,
          duration_minutes: String(duration),
        });

        const response = await fetch(`/api/availability?${params.toString()}`, {
          cache: "no-store",
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            result.error || "Не удалось загрузить свободное время.",
          );
        }

        const items = Array.isArray(result.slots)
          ? (result.slots as Slot[])
          : [];

        if (cancelled) return;

        setSlots(items);

        setSelectedSlots((current) =>
          current.filter((selection) =>
            items.some(
              (slot) =>
                `${slot.start_at}|${slot.duration_minutes}` ===
                  selection.key &&
                slot.available_tables.length > 0,
            ),
          ),
        );
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Не удалось загрузить свободное время.",
          );
          setSlots([]);
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    }

    void loadSlots();

    return () => {
      cancelled = true;
    };
  }, [studioId, date, duration, refreshKey]);

  useEffect(() => {
    if (!selectedStudio) return;

    const selectedDate = dateInTimezone(selectedStudio.timezone);
    const maxAllowedDate = dateInTimezone(
      selectedStudio.timezone,
      selectedStudio.settings.booking_horizon_days,
    );

    if (date && (date < selectedDate || date > maxAllowedDate)) {
      setDate(selectedDate);
      setSelectedSlots([]);
      setHoldResult(null);
    }
  }, [selectedStudio, date]);

  const toggleSlot = (slot: Slot) => {
    const key = `${slot.start_at}|${slot.duration_minutes}`;

    setHoldResult(null);
    setSelectionError("");

    if (slot.available_tables.length === 0) return;

    setSelectedSlots((current) => {
      const exists = current.some((selection) => selection.key === key);

      if (exists) {
        return current.filter((selection) => selection.key !== key);
      }

      if (current.length >= 10) {
        setSelectionError("За один заказ можно выбрать не более 10 часовых слотов.");
        return current;
      }

      const candidateStart = Date.parse(slot.start_at);
      const candidateEnd = Date.parse(slot.end_at);
      const overlaps = current.some((selection) => {
        const selected = slots.find(
          (item) => item.start_at === selection.key.split("|")[0],
        );
        if (!selected) return false;
        const selectedStart = Date.parse(selected.start_at);
        const selectedEnd = Date.parse(selected.end_at);
        return candidateStart < selectedEnd && candidateEnd > selectedStart;
      });

      if (overlaps) {
        setSelectionError(
          "Этот слот пересекается с уже выбранным временем. Снимите пересекающийся выбор или выберите другое время.",
        );
        return current;
      }

      return [...current, { key }];
    });
  };

  const createHold = async () => {
    if (!selectedStudio || !date || bookingGroups.length === 0) return;

    if (hasUnavailableSelectedSlots) {
      setHoldError(
        "Один из выбранных слотов больше недоступен. Обновите выбор перед резервированием.",
      );
      return;
    }

    if (!offerAccepted) {
      setHoldError(
        "Перед резервированием ознакомьтесь с офертой и подтвердите согласие с её условиями.",
      );
      return;
    }

    const normalizedComment = customerComment.trim();

    if (normalizedComment.length > 500) {
      setHoldError("Комментарий не должен превышать 500 символов.");
      return;
    }

    if (fundingMethod === "pass" && passInsufficient) {
      setHoldError("В выбранном абонементе недостаточно свободных часов или он не действует в этом городе.");
      return;
    }
    if (unavailableService) {
      setHoldError(`Услуга «${unavailableService.title}» недоступна для одного из выбранных слотов.`);
      return;
    }

    setCreatingHold(true);
    setHoldError("");
    setHoldResult(null);
    setConfirmedMessage("");

    const advancedOrder = fundingMethod === "pass" || selectedServiceIds.length > 0;
    const storedKeyIsValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingRequestKey);
    const requestKey = advancedOrder ? (storedKeyIsValid ? bookingRequestKey : crypto.randomUUID()) : null;
    if (requestKey) setBookingRequestKey(requestKey);

    try {
      const response = await fetch("/api/bookings/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          studio_id: studioId,
          date,
          customer_comment: normalizedComment || null,
          funding_method: fundingMethod,
          user_pass_id: fundingMethod === "pass" ? selectedPassId : null,
          service_ids: selectedServiceIds,
          request_key: requestKey,
          groups: bookingGroups.map((group) => ({
            start_at: group.start_at,
            duration_minutes: 60,
          })),
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 409 && advancedOrder) setBookingRequestKey("");
        throw new Error(
          result.error ||
            (response.status === 401
              ? "Войдите в личный кабинет и подтвердите номер телефона."
              : "Не удалось зарезервировать выбранное время."),
        );
      }

      if (
        !Array.isArray(result.bookings) ||
        result.bookings.length !== bookingGroups.length ||
        !result.bookings.every((booking: Record<string, unknown>) =>
          typeof booking.id === "string" &&
          typeof booking.start_at === "string" &&
          typeof booking.end_at === "string" &&
          Number.isFinite(Number(booking.price_rub)),
        )
      ) {
        throw new Error(
          "Сервер не подтвердил создание всех броней. Обновите страницу перед повторной попыткой.",
        );
      }

      const nextStep = result.next_step === "confirmed" ? "confirmed" : "payment";
      const normalized: HoldResult = {
        payment_group_id: typeof result.payment_group_id === "string" ? result.payment_group_id : null,
        next_step: nextStep,
        funding_method: result.funding_method === "pass" ? "pass" : fundingMethod,
        bookings: result.bookings.map((booking: Record<string, unknown>) => ({
          id: String(booking.id),
          start_at: String(booking.start_at),
          end_at: String(booking.end_at),
          price_rub: Number(booking.price_rub),
          hold_expires_at: typeof booking.hold_expires_at === "string" ? booking.hold_expires_at : null,
        })),
        total_price_rub: Number(result.total_price_rub ?? 0),
        hold_expires_at: typeof result.hold_expires_at === "string" ? result.hold_expires_at : null,
        pass_hours_consumed: Number(result.pass_hours_consumed ?? 0),
        pass_hours_reserved: Number(result.pass_hours_reserved ?? 0),
      };

      if (!isValidHoldResult(normalized)) {
        throw new Error("Сервер вернул некорректные данные бронирования. Обновите страницу.");
      }

      setHoldResult(normalized);
      setSelectionError("");
      if (normalized.next_step === "confirmed") {
        setConfirmedMessage(`Бронирование подтверждено. Списано часов с абонемента: ${normalized.pass_hours_consumed || normalized.bookings.length}.`);
        clearBookingDraft();
        void fetch("/api/account/passes", { credentials: "same-origin", cache: "no-store" })
          .then((passResponse) => passResponse.json())
          .then((passResult) => {
            if (Array.isArray(passResult.passes)) setPasses(passResult.passes as PassOption[]);
          })
          .catch(() => undefined);
      }
    } catch (caught) {
      setHoldError(
        caught instanceof Error
          ? caught.message
          : "Не удалось создать временную бронь. Повторите попытку.",
      );
    } finally {
      setCreatingHold(false);
    }
  };

  // Запускаем оплату уже созданной группы броней.
  // Создавать новую группу при повторном нажатии нельзя.
  const startPayment = async () => {
    if (holdResult?.next_step === "confirmed") return;
    if (!holdResult?.payment_group_id) {
      setHoldError(
        "Не найден идентификатор группы бронирования. Обновите страницу и проверьте бронирование в личном кабинете.",
      );
      return;
    }

    setCreatingPayment(true);
    setHoldError("");

    try {
      const response = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          payment_group_id: holdResult.payment_group_id,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Не удалось начать оплату. Проверьте бронирование в личном кабинете.",
        );
      }

      if (result.state === "succeeded") {
        clearBookingDraft();

        window.location.assign(
          `/payment/return?payment_group_id=${encodeURIComponent(
            holdResult.payment_group_id,
          )}`,
        );

        return;
      }

      if (
        result.state !== "pending" ||
        typeof result.confirmation_url !== "string"
      ) {
        throw new Error(
          "Платёжный сервис не вернул ссылку для оплаты. Повторите попытку.",
        );
      }

      const paymentUrl = new URL(result.confirmation_url);

      if (paymentUrl.protocol !== "https:") {
        throw new Error(
          "Получена небезопасная ссылка оплаты. Обратитесь в поддержку.",
        );
      }

      clearBookingDraft();
      window.location.assign(paymentUrl.toString());
    } catch (caught) {
      setHoldError(
        caught instanceof Error
          ? caught.message
          : "Не удалось перейти к оплате. Повторите попытку.",
      );
    } finally {
      setCreatingPayment(false);
    }
  };

  if (loadingStudios) {
    return (
      <div
        role="status"
        className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/65"
      >
        <RefreshCw
          size={18}
          className="animate-spin text-[#A77BFF]"
        />
        Загружаем список клубов...
      </div>
    );
  }

  if (studios.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/60">
        Сейчас нет активных клубов для бронирования.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/45">
            Клуб
          </span>
          <span className="relative block">
            <MapPin
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
            />
            <select
              value={studioId}
              onChange={(event) => {
                setStudioId(event.target.value);
                setSelectedSlots([]);
                setHoldResult(null);
                setSelectionError("");
              }}
              className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-[#11152A] pl-10 pr-4 text-sm text-white outline-none transition focus:border-[#A77BFF]/60"
            >
              {studios.map((studio) => (
                <option key={studio.id} value={studio.id}>
                  {studio.name}
                </option>
              ))}
            </select>
          </span>
          {selectedStudio?.address && (
            <span className="mt-2 block text-xs text-white/35">
              {selectedStudio.address}
            </span>
          )}
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/45">
            Дата
          </span>
          <span className="relative block">
            <CalendarDays
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
            />
            <input
              type="date"
              value={date}
              min={minDate}
              max={maxDate}
              onChange={(event) => {
                setDate(event.target.value);
                setSelectedSlots([]);
                setHoldResult(null);
                setSelectionError("");
              }}
              className="h-12 w-full rounded-xl border border-white/10 bg-[#11152A] pl-10 pr-4 text-sm text-white outline-none transition focus:border-[#A77BFF]/60"
            />
          </span>
          {date && (
            <span className="mt-2 block text-xs capitalize text-white/35">
              {formatDate(date)}
            </span>
          )}
        </label>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-white">Свободное время</h3>
            <p className="mt-1 text-xs text-white/40">
              Продолжительность каждого слота — 60 минут. Можно выбрать несколько часов.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((current) => current + 1)}
            disabled={loadingSlots}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-white/60 transition hover:bg-white/[0.05] disabled:opacity-50"
          >
            <RefreshCw size={14} className={loadingSlots ? "animate-spin" : ""} />
            Обновить
          </button>
        </div>

        {loadingSlots ? (
          <div className="flex items-center gap-2 py-8 text-sm text-white/45">
            <RefreshCw size={16} className="animate-spin" />
            Проверяем доступность...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm text-red-100">
            {error}
          </div>
        ) : slots.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5 text-center text-sm text-white/45">
            На выбранную дату свободных слотов нет. Выберите другой день.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {slots.map((slot) => {
              const key = `${slot.start_at}|${slot.duration_minutes}`;
              const selected = selectedSlots.some((item) => item.key === key);
              const available = slot.available_tables.length > 0;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={!available}
                  onClick={() => toggleSlot(slot)}
                  className={`rounded-xl border p-3 text-left transition ${
                    selected
                      ? "border-[#A77BFF]/70 bg-[#7540D8]/20"
                      : available
                        ? "border-white/10 bg-white/[0.025] hover:border-white/25 hover:bg-white/[0.05]"
                        : "cursor-not-allowed border-white/5 bg-white/[0.015] opacity-35"
                  }`}
                >
                  <span className="block text-sm font-semibold tabular-nums text-white">
                    {new Intl.DateTimeFormat("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: selectedStudio?.timezone || "Europe/Moscow",
                    }).format(new Date(slot.start_at))}
                  </span>
                  <span className="mt-1 block text-xs text-white/45">
                    {money(slot.price_rub)}
                  </span>
                  <span className="mt-2 block text-[10px] text-white/30">
                    {available ? `${slot.available_tables.length} стол(а)` : "Занято"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {selectionError && (
          <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-3 text-xs text-amber-100">
            {selectionError}
          </p>
        )}
      </div>

      {selectedSlots.length > 0 && (
        <div className="rounded-2xl border border-[#A77BFF]/20 bg-[#7540D8]/[0.06] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-white">Выбранные слоты</h3>
              <p className="mt-1 text-xs text-white/45">
                {selectedSlots.length} {selectedSlots.length === 1 ? "час" : "часа/часов"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/40">К оплате</p>
              <p className="text-xl font-semibold text-white">{money(totalAmountDue)}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {bookingGroups.map((group) => (
              <div key={group.start_at} className="flex items-center justify-between gap-3 rounded-lg bg-black/10 px-3 py-2 text-sm">
                <span className="text-white/75">
                  {new Intl.DateTimeFormat("ru-RU", {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: selectedStudio?.timezone || "Europe/Moscow",
                  }).format(new Date(group.start_at))}
                </span>
                <span className="font-medium tabular-nums text-white">
                  {fundingMethod === "pass" ? "1 час абонемента" : money(group.price_rub)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-black/10 p-4">
            <p className="text-sm font-semibold text-white">Способ оплаты слотов</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => { setFundingMethod("cash"); setHoldResult(null); setConfirmedMessage(""); }}
                className={`rounded-xl border p-3 text-left transition ${fundingMethod === "cash" ? "border-violet-400/50 bg-violet-400/10" : "border-white/10 hover:bg-white/[0.04]"}`}
              >
                <span className="block text-sm font-semibold text-white">Оплата картой</span>
                <span className="mt-1 block text-xs text-white/45">Через ЮKassa</span>
              </button>
              <button
                type="button"
                onClick={() => { setFundingMethod("pass"); setHoldResult(null); setConfirmedMessage(""); }}
                className={`rounded-xl border p-3 text-left transition ${fundingMethod === "pass" ? "border-violet-400/50 bg-violet-400/10" : "border-white/10 hover:bg-white/[0.04]"}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-white"><WalletCards size={15} /> Абонемент</span>
                <span className="mt-1 block text-xs text-white/45">Списание одного часа за каждый слот</span>
              </button>
            </div>

            {fundingMethod === "pass" && (
              <div className="mt-3">
                {loadingPasses ? (
                  <p className="flex items-center gap-2 text-xs text-white/45"><RefreshCw size={13} className="animate-spin" /> Загружаем абонементы…</p>
                ) : cityPasses.length === 0 ? (
                  <p className="text-xs leading-5 text-amber-100/80">
                    Нет действующего абонемента для города «{selectedStudio?.name}». <Link href="/account?tab=passes" className="text-violet-200 underline">Купить абонемент</Link>
                  </p>
                ) : (
                  <>
                    <label className="block text-xs text-white/50">Выберите абонемент
                      <select value={selectedPassId} onChange={(event) => { setSelectedPassId(event.target.value); setHoldResult(null); setConfirmedMessage(""); }} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#11152A] px-3 text-sm text-white">
                        <option value="">Выберите абонемент</option>
                        {cityPasses.map((pass) => <option key={pass.id} value={pass.id}>{pass.plan_name_snapshot} — {pass.remaining_hours} ч. доступно · до {formatPassExpiry(pass.expires_at, pass.timezone_snapshot)}</option>)}
                      </select>
                    </label>
                    {selectedPass && (
                      <p className={`mt-2 text-xs ${selectedPass.remaining_hours < passHoursNeeded ? "text-red-200" : "text-emerald-200"}`}>
                        Доступно {passAvailableHours} ч.; зарезервировано: {selectedPass.reserved_hours} ч.; для выбранных слотов требуется {passHoursNeeded} ч.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Дополнительные услуги</p>
                <p className="mt-1 text-xs text-white/40">Настраиваются отдельно для каждого клуба.</p>
              </div>
              {loadingServices && <RefreshCw size={14} className="animate-spin text-white/40" />}
            </div>

            {!loadingServices && services.length === 0 ? (
              <p className="mt-3 text-xs text-white/40">Для этого клуба дополнительные услуги пока не настроены.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {services.map((service) => {
                  const checked = selectedServiceIds.includes(service.id);
                  const unavailable = bookingGroups.some((group) => !isServiceAvailableForSlot(service, group.start_at, selectedStudio?.timezone || "Europe/Moscow"));
                  const servicePrice = service.charge_mode === "per_slot" ? service.price_rub * bookingGroups.length : service.price_rub;
                  return (
                    <div key={service.id} className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${checked ? "border-violet-400/35 bg-violet-400/[0.06]" : "border-white/10"}`}>
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                        <input type="checkbox" checked={checked} disabled={unavailable && !checked} onChange={(event) => {
                          setHoldResult(null);
                          setConfirmedMessage("");
                          setSelectedServiceIds((current) => event.target.checked
                            ? current.length < 2 ? [...current, service.id] : current
                            : current.filter((id) => id !== service.id));
                        }} className="mt-0.5 h-4 w-4 shrink-0 accent-violet-400" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-white">{service.title}</span>
                          <span className="mt-1 block text-xs text-white/45">{money(servicePrice)} · {service.charge_mode === "per_slot" ? "за каждый слот" : "за всю группу"}</span>
                          {unavailable && <span className="mt-1 block text-[11px] text-amber-200">Недоступна для одного из выбранных слотов</span>}
                        </span>
                      </label>
                      <button type="button" onClick={() => setServiceInfo(service)} aria-label={`Информация: ${service.title}`} className="rounded-lg p-1.5 text-white/45 hover:bg-white/[0.06] hover:text-white"><Info size={15} /></button>
                    </div>
                  );
                })}
              </div>
            )}
            {selectedServiceIds.length >= 2 && <p className="mt-2 text-[11px] text-white/35">Можно выбрать не более двух дополнительных услуг.</p>}
            {unavailableService && <p className="mt-2 text-xs text-amber-100">Услуга «{unavailableService.title}» не подходит для выбранного времени.</p>}
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-white/55">
            <div className="flex justify-between gap-3"><span>Игровые слоты</span><span>{fundingMethod === "pass" ? `${passHoursNeeded} ч. абонемента` : money(totalPrice)}</span></div>
            {selectedServices.map((service) => (
              <div key={service.id} className="mt-1 flex justify-between gap-3"><span>{service.title}</span><span>{money(service.charge_mode === "per_slot" ? service.price_rub * bookingGroups.length : service.price_rub)}</span></div>
            ))}
            <div className="mt-2 flex justify-between gap-3 border-t border-white/10 pt-2 text-sm font-semibold text-white">
              <span>{fundingMethod === "pass" && totalAmountDue > 0 ? "К оплате за услуги" : "К оплате"}</span>
              <span>{fundingMethod === "pass" && totalAmountDue === 0 ? "Без доплаты" : money(totalAmountDue)}</span>
            </div>
          </div>

          <label className="mt-4 block">
            <span className="mb-2 block text-xs font-medium text-white/55">
              Комментарий для администратора (необязательно)
            </span>
            <textarea
              value={customerComment}
              onChange={(event) => setCustomerComment(event.target.value.slice(0, 500))}
              maxLength={500}
              rows={3}
              placeholder="Например, пожелания по столу или дополнительная информация"
              className="w-full rounded-xl border border-white/10 bg-[#11152A] p-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#A77BFF]/60"
            />
            <span className="mt-1 block text-right text-[10px] text-white/30">
              {customerComment.length}/500
            </span>
          </label>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
            <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-white/60">
              <input
                type="checkbox"
                checked={offerAccepted}
                onChange={(event) => setOfferAccepted(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#A77BFF]"
              />
              <span>
                Я ознакомился(ась) и согласен(на) с условиями публичной оферты и правилами бронирования. {fundingMethod === "pass" && "При бронировании по абонементу час списывается после подтверждения брони."}
                <Link href="/offer" target="_blank" className="ml-1 text-[#C5ACFF] underline">
                  Читать оферту
                </Link>
              </span>
            </label>
          </div>

          {holdError && (
            <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-3 text-xs text-red-100">
              {holdError}
            </div>
          )}

          {holdResult ? (
            <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
              {holdResult.next_step === "confirmed" ? (
                <>
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                    <CheckCircle2 size={17} /> Бронирование подтверждено
                  </div>
                  <p className="mt-2 text-xs leading-5 text-white/60">
                    {confirmedMessage || "Часы списаны с абонемента. Бронь уже отображается в личном кабинете."}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setHoldResult(null);
                      setSelectedSlots([]);
                      setSelectedServiceIds([]);
                      setConfirmedMessage("");
                      clearBookingDraft();
                    }}
                    className="mt-4 h-10 w-full rounded-xl bg-emerald-500/90 text-sm font-semibold text-white hover:bg-emerald-500"
                  >
                    Понятно
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                    <CheckCircle2 size={17} /> Временная бронь создана
                  </div>
                  <p className="mt-2 text-xs leading-5 text-white/55">
                    Выбранное время удерживается до {holdResult.hold_expires_at ? new Intl.DateTimeFormat("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "long",
                      timeZone: selectedStudio?.timezone || "Europe/Moscow",
                    }).format(new Date(holdResult.hold_expires_at)) : "окончания резерва"}. Завершите оплату в течение 5 минут.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-white/40">К оплате</p>
                      <p className="text-xl font-semibold text-white">{money(holdResult.total_price_rub)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void startPayment()}
                      disabled={creatingPayment}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#7540D8] px-5 text-sm font-semibold text-white transition hover:bg-[#8753E8] disabled:opacity-50"
                    >
                      {creatingPayment ? <RefreshCw size={15} className="animate-spin" /> : <Clock3 size={15} />}
                      Перейти к оплате
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void createHold()}
              disabled={creatingHold || creatingPayment || !offerAccepted || hasUnavailableSelectedSlots || (fundingMethod === "pass" && (passInsufficient || loadingPasses)) || Boolean(unavailableService)}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#7540D8] px-5 text-sm font-semibold text-white transition hover:bg-[#8753E8] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {creatingHold ? <RefreshCw size={16} className="animate-spin" /> : <CalendarDays size={16} />}
              {creatingHold
                ? "Создаём резерв..."
                : fundingMethod === "pass" && selectedServiceIds.length === 0
                  ? "Подтвердить бронирование за абонемент"
                  : "Зарезервировать и перейти к оплате"}
            </button>
          )}

          <p className="mt-3 text-center text-[10px] leading-4 text-white/30">
            Продолжительность каждого выбранного слота — 60 минут. Стол назначается автоматически.
          </p>
        </div>
      )}

      {serviceInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label={serviceInfo.title}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#14182E] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">{serviceInfo.title}</h3>
              <button type="button" onClick={() => setServiceInfo(null)} className="rounded-lg p-1.5 text-white/55 hover:bg-white/[0.06]"><X size={17} /></button>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/65">{serviceInfo.description || "Описание услуги не добавлено."}</p>
            <p className="mt-4 text-sm font-semibold text-white">{money(serviceInfo.charge_mode === "per_slot" ? serviceInfo.price_rub * bookingGroups.length : serviceInfo.price_rub)}</p>
            <button type="button" onClick={() => setServiceInfo(null)} className="mt-5 h-10 w-full rounded-xl bg-violet-500 text-sm font-semibold text-white">Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}
