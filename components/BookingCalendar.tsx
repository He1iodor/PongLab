
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock3,
  MapPin,
  RefreshCw,
  Table2,
} from "lucide-react";

type Studio = {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  settings: {
    slot_interval_minutes: number;
    allowed_durations_minutes: number[];
    booking_horizon_days: number;
    minimum_notice_minutes: number;
    allow_same_day_booking: boolean;
  };
};

type AvailableTable = {
  id: string;
  name: string;
};

type Slot = {
  start_at: string;
  end_at: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  price_rub: number;
  available_tables: AvailableTable[];
};

type SelectedSlot = {
  key: string;
  tableId: string;
};

type HoldResult = {
  bookings: Array<{
    id: string;
    start_at: string;
    end_at: string;
    price_rub: number;
    hold_expires_at: string;
    table_id: string;
  }>;
  total_price_rub: number;
  hold_expires_at: string;
};

type BookingGroup = {
  slots: Slot[];
  tableId: string;
  start_at: string;
  end_at: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  price_rub: number;
};

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

function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} мин.`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes
    ? `${hours} ч ${remainingMinutes} мин.`
    : `${hours} ч`;
}

export default function BookingCalendar() {
  const [studios, setStudios] = useState<Studio[]>([]);
  const [studioId, setStudioId] = useState("");
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState(60);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([]);
  const [selectionError, setSelectionError] = useState("");
  const [loadingStudios, setLoadingStudios] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [offerAccepted, setOfferAccepted] = useState(false);
  const [creatingHold, setCreatingHold] = useState(false);
  const [holdError, setHoldError] = useState("");
  const [holdResult, setHoldResult] = useState<HoldResult | null>(null);

  const selectedStudio = useMemo(
    () => studios.find((studio) => studio.id === studioId) ?? null,
    [studios, studioId],
  );

  const availableDurations = [60];

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

  // Объединяем соседние выбранные слоты только при совпадении стола.
  const bookingGroups = useMemo(() => {
    const groups: BookingGroup[] = [];

    for (const { selection, slot } of resolvedSelectedSlots) {
      const previous = groups[groups.length - 1];

      if (
        previous &&
        previous.end_at === slot.start_at &&
        previous.tableId === selection.tableId
      ) {
        previous.slots.push(slot);
        previous.end_at = slot.end_at;
        previous.ends_at = slot.ends_at;
        previous.duration_minutes += slot.duration_minutes;
        previous.price_rub += slot.price_rub;
      } else {
        groups.push({
          slots: [slot],
          tableId: selection.tableId,
          start_at: slot.start_at,
          end_at: slot.end_at,
          starts_at: slot.starts_at,
          ends_at: slot.ends_at,
          duration_minutes: slot.duration_minutes,
          price_rub: slot.price_rub,
        });
      }
    }

    return groups;
  }, [resolvedSelectedSlots]);

  const totalPrice = bookingGroups.reduce(
    (total, group) => total + group.price_rub,
    0,
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

          setDate((current) => current || dateInTimezone(first.timezone));

          setDuration((current) =>
            first.settings.allowed_durations_minutes.includes(current)
              ? current
              : first.settings.allowed_durations_minutes[0] ?? 60,
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
    if (!selectedStudio) return;

    if (duration !== 60) setDuration(60);

    if (!date || date < minDate || date > maxDate) {
      setDate(minDate);
    }
  }, [
    selectedStudio,
    availableDurations,
    duration,
    date,
    minDate,
    maxDate,
  ]);

  const loadSlots = useCallback(async () => {
    if (!studioId || !date || !duration) return;

    setLoadingSlots(true);
    setError("");
    setSelectedSlots([]);
    setSelectionError("");
    setHoldError("");
    setHoldResult(null);
    setOfferAccepted(false);

    try {
      const params = new URLSearchParams({
        studio_id: studioId,
        date,
        duration_minutes: String(duration),
      });

      const response = await fetch(
        `/api/availability?${params.toString()}`,
        { cache: "no-store" },
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error || "Не удалось загрузить доступное время.",
        );
      }

      setSlots(Array.isArray(result.slots) ? (result.slots as Slot[]) : []);
    } catch (caught) {
      setSlots([]);
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось загрузить доступное время.",
      );
    } finally {
      setLoadingSlots(false);
    }
  }, [studioId, date, duration]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const selectSlot = (slot: Slot) => {
    const key = `${slot.start_at}|${slot.duration_minutes}`;
    const alreadySelected = selectedSlots.some(
      (selection) => selection.key === key,
    );

    setSelectionError("");
    setHoldError("");
    setHoldResult(null);

    if (alreadySelected) {
      setSelectedSlots((current) =>
        current.filter((selection) => selection.key !== key),
      );
      return;
    }

    const overlaps = selectedSlots.some((selection) => {
      const selected = slots.find(
        (item) =>
          `${item.start_at}|${item.duration_minutes}` === selection.key,
      );

      return Boolean(
        selected &&
          new Date(selected.start_at).getTime() <
            new Date(slot.end_at).getTime() &&
          new Date(selected.end_at).getTime() >
            new Date(slot.start_at).getTime(),
      );
    });

    if (overlaps) {
      setSelectionError(
        "Этот слот пересекается с уже выбранным временем. Снимите пересекающийся выбор или выберите другое время.",
      );
      return;
    }

    const defaultTableId = slot.available_tables[0]?.id;
    if (!defaultTableId) return;

    setSelectedSlots((current) => [
      ...current,
      { key, tableId: defaultTableId },
    ]);
  };

  const selectTableForSlot = (key: string, tableId: string) => {
    setHoldError("");
    setHoldResult(null);

    setSelectedSlots((current) =>
      current.map((selection) =>
        selection.key === key ? { ...selection, tableId } : selection,
      ),
    );

    setSelectionError("");
  };

  const createHold = async () => {
    if (!selectedStudio || !date || bookingGroups.length === 0) return;

    if (!offerAccepted) {
      setHoldError(
        "Перед резервированием ознакомьтесь с офертой и подтвердите согласие с её условиями.",
      );
      return;
    }

    setCreatingHold(true);
    setHoldError("");
    setHoldResult(null);

    try {
      const response = await fetch("/api/bookings/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          studio_id: studioId,
          date,
          groups: bookingGroups.map((group) => ({
            table_id: group.tableId,
            start_at: group.start_at,
            duration_minutes: group.duration_minutes,
          })),
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
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
        !result.hold_expires_at
      ) {
        throw new Error(
          "Сервер не подтвердил создание всех временных броней. Обновите страницу перед повторной попыткой.",
        );
      }

      setHoldResult(result as HoldResult);
      setOfferAccepted(false);
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
        Загружаем клубы...
      </div>
    );
  }

  if (studios.length === 0 && !error) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5 text-sm leading-6 text-white/65">
        Пока нет доступных клубов для бронирования. Когда клуб будет
        активирован в панели владельца и для него настроено расписание,
        он появится здесь.
      </div>
    );
  }

  return (
    <section
      className="w-full min-w-0 space-y-6 rounded-2xl border border-white/10 bg-white/[0.035] p-3 sm:p-5 lg:p-6"
      aria-label="Выбор бронирования"
    >
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white sm:text-xl">
          <CalendarDays
            size={21}
            className="shrink-0 text-[#A77BFF]"
          />
          Выберите подходящий слот:
        </h3>

        <p className="mt-2 text-sm leading-6 text-white/55">
          Выберите клуб, дату и длительность. Ниже отобразятся свободные
          слоты и актуальная стоимость.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm leading-5 text-red-200"
        >
          {error}

          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            className="ml-2 underline underline-offset-2"
          >
            Повторить
          </button>
        </div>
      )}

      {studios.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="min-w-0 space-y-2 lg:col-span-1">
              <label
                htmlFor="booking-studio"
                className="block text-sm font-medium text-white/85"
              >
                Клуб
              </label>

              <select
                id="booking-studio"
                value={studioId}
                onChange={(event) => {
                  setStudioId(event.target.value);
                  setDate("");
                  setSelectedSlots([]);
                  setSelectionError("");
                  setHoldError("");
                  setHoldResult(null);
                  setOfferAccepted(false);
                }}
                className="h-12 w-full rounded-xl border border-white/15 bg-[#101326] px-3 text-sm text-white outline-none focus:border-[#8F5BFF]"
              >
                {studios.map((studio) => (
                  <option key={studio.id} value={studio.id}>
                    {studio.name}
                  </option>
                ))}
              </select>

              {selectedStudio?.address && (
                <p className="flex items-start gap-2 text-xs leading-5 text-white/45">
                  <MapPin
                    size={14}
                    className="mt-0.5 shrink-0"
                  />
                  {selectedStudio.address}
                </p>
              )}
            </div>

            <div className="min-w-0 space-y-2">
              <label
                htmlFor="booking-date"
                className="block text-sm font-medium text-white/85"
              >
                Дата
              </label>

              <div className="relative">
                <input
                  id="booking-date"
                  type="date"
                  min={minDate}
                  max={maxDate}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="h-12 w-full min-w-0 rounded-xl border border-white/15 bg-[#101326] px-3 pr-11 text-sm text-white outline-none focus:border-[#8F5BFF] [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-11 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                />

                <CalendarDays
                  size={18}
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white"
                />
              </div>
            </div>

            <div className="min-w-0 space-y-2">
              <label
                htmlFor="booking-duration"
                className="block text-sm font-medium text-white/85"
              >
                Длительность
              </label>

              <select
                id="booking-duration"
                value={duration}
                onChange={(event) =>
                  setDuration(Number(event.target.value))
                }
                className="h-12 w-full rounded-xl border border-white/15 bg-[#101326] px-3 text-sm text-white outline-none focus:border-[#8F5BFF]"
              >
                {availableDurations.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {durationLabel(minutes)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <h4 className="flex items-center gap-2 text-base font-semibold text-white">
                <Clock3
                  size={18}
                  className="text-[#A77BFF]"
                />
                Свободное время
              </h4>

              {date && (
                <span className="text-right text-xs capitalize text-white/45">
                  {formatDate(date)}
                </span>
              )}
            </div>

            {loadingSlots ? (
              <div
                role="status"
                className="flex items-center gap-2 py-6 text-sm text-white/55"
              >
                <RefreshCw
                  size={16}
                  className="animate-spin"
                />
                Проверяем свободные столы и тарифы...
              </div>
            ) : slots.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/10 p-5 text-sm leading-6 text-white/55">
                На выбранную дату нет свободных слотов с этой
                длительностью. Попробуйте другую дату или длительность.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {slots.map((slot) => {
                  const key = `${slot.start_at}|${slot.duration_minutes}`;
                  const disabled = slot.available_tables.length === 0;
                  const active = selectedSlots.some(
                    (selection) => selection.key === key,
                  );

                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectSlot(slot)}
                      className={`min-w-0 rounded-xl border p-3 text-left transition ${
                        active
                          ? "border-[#A77BFF] bg-[#6B30CE]/25 ring-1 ring-[#A77BFF]/30"
                          : disabled
                            ? "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-35"
                            : "border-white/10 bg-white/[0.035] hover:border-white/25 hover:bg-white/[0.07]"
                      }`}
                    >
                      <span className="block text-sm font-semibold text-white sm:text-base">
                        {slot.starts_at}–{slot.ends_at}
                      </span>

                      <span className="mt-2 block text-sm font-medium text-[#C8B2FF]">
                        {money(slot.price_rub)}
                      </span>

                      <span className="mt-1 block text-xs leading-4 text-white/45">
                        {slot.available_tables.length
                          ? `Свободно столов: ${slot.available_tables.length}`
                          : "Нет свободных столов"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectionError && (
            <div
              role="alert"
              className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm leading-5 text-amber-100"
            >
              {selectionError}
            </div>
          )}

          {resolvedSelectedSlots.length > 0 && (
            <div className="space-y-5 rounded-xl border border-[#8F5BFF]/25 bg-[#6B30CE]/10 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Table2
                  size={20}
                  className="mt-0.5 shrink-0 text-[#A77BFF]"
                />
                <div>
                  <p className="text-sm font-semibold text-white">
                    Выбранные слоты
                  </p>
                  <p className="mt-1 text-xs leading-5 text-white/50">
                    Можно выбрать несколько периодов. Пересекающиеся слоты
                    нельзя добавить одновременно. Для каждого периода можно
                    назначить стол.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {resolvedSelectedSlots.map(({ selection, slot }) => (
                  <div
                    key={selection.key}
                    className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-black/10 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,220px)_auto] sm:items-center"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {slot.starts_at}–{slot.ends_at}
                      </p>
                      <p className="mt-1 text-xs text-white/50">
                        {durationLabel(slot.duration_minutes)} ·{" "}
                        {money(slot.price_rub)}
                      </p>
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-xs text-white/50">
                        Стол
                      </span>
                      <select
                        value={selection.tableId}
                        onChange={(event) =>
                          selectTableForSlot(
                            selection.key,
                            event.target.value,
                          )
                        }
                        className="h-10 w-full rounded-lg border border-white/15 bg-[#101326] px-3 text-sm text-white outline-none focus:border-[#8F5BFF]"
                      >
                        {slot.available_tables.map((table) => (
                          <option key={table.id} value={table.id}>
                            {table.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      onClick={() => selectSlot(slot)}
                      className="h-10 rounded-lg border border-white/10 px-3 text-sm text-white/70 transition hover:border-red-300/40 hover:bg-red-400/10 hover:text-white"
                    >
                      Убрать
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-3 border-t border-white/10 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-white">
                    Итоговая разбивка бронирований
                  </h4>
                  <span className="text-xs text-white/50">
                    Броней: {bookingGroups.length}
                  </span>
                </div>

                {bookingGroups.map((group, index) => {
                  const tableName =
                    group.slots[0]?.available_tables.find(
                      (table) => table.id === group.tableId,
                    )?.name ?? "Выбранный стол";

                  return (
                    <div
                      key={`${group.start_at}|${group.tableId}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">
                          Бронь {index + 1}: {group.starts_at}–{group.ends_at}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-white/50">
                          {durationLabel(group.duration_minutes)} ·{" "}
                          {tableName}
                          {group.slots.length > 1
                            ? ` · объединено слотов: ${group.slots.length}`
                            : ""}
                        </p>
                      </div>
                      <p className="text-base font-semibold text-[#C8B2FF]">
                        {money(group.price_rub)}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-sm text-white/60">Общая стоимость</p>
                  <p className="mt-1 text-xs text-white/45">
                    Сумма цен выбранных слотов
                  </p>
                </div>
                <span className="text-xl font-semibold text-white">
                  {money(totalPrice)}
                </span>
              </div>

              <div className="space-y-4 border-t border-white/10 pt-4">
                <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-white/75">
                  <input
                    type="checkbox"
                    checked={offerAccepted}
                    onChange={(event) => {
                      setOfferAccepted(event.target.checked);
                      setHoldError("");
                    }}
                    className="mt-1 h-4 w-4 shrink-0 accent-[#A77BFF]"
                  />
                  <span>
                    Я ознакомился(-ась) с{" "}
                    <Link
  href="/oferta"
  className="text-[#C8B2FF] underline underline-offset-4 hover:text-white"
>
  договором-офертой
</Link>{" "}
                    и согласен(-на) с его условиями. Понимаю, что временный
                    резерв сам по себе не заключает договор: согласно оферте,
                    договор заключается после полной оплаты.
                  </span>
                </label>

                {holdError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm leading-6 text-red-200"
                  >
                    {holdError}
                  </div>
                )}

                {holdResult ? (
                  <div
                    role="status"
                    className="space-y-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-4"
                  >
                    <p className="font-semibold text-emerald-100">
                      Временная бронь создана
                    </p>
                    <p className="text-sm leading-6 text-white/75">
                      Выбранное время удерживается до{" "}
                      {new Intl.DateTimeFormat("ru-RU", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone:
                          selectedStudio?.timezone || "Europe/Moscow",
                      }).format(new Date(holdResult.hold_expires_at))}.
                    </p>
                    <p className="text-sm leading-6 text-white/75">
                      Сумма резерва: {money(holdResult.total_price_rub)}.
                      Переход к оплате ещё не подключён, деньги не списаны.
                    </p>
                    <p className="text-xs leading-5 text-white/50">
                      Номера временных броней:{" "}
                      {holdResult.bookings
                        .map((booking) => booking.id)
                        .join(", ")}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void createHold()}
                    disabled={
                      !offerAccepted ||
                      creatingHold ||
                      bookingGroups.length === 0
                    }
                    className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#8F5BFF] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#A77BFF] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {creatingHold
                      ? "Создаём временную бронь..."
                      : "Зарезервировать на 10 минут"}
                  </button>
                )}

                <p className="text-xs leading-5 text-white/45">
                  Резерв не является оплатой. Если не завершить оплату до
                  истечения срока удержания, бронь будет освобождена системой.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
