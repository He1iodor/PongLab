
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedTableId, setSelectedTableId] = useState("");
  const [loadingStudios, setLoadingStudios] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const selectedStudio = useMemo(
    () => studios.find((studio) => studio.id === studioId) ?? null,
    [studios, studioId],
  );

  const availableDurations =
    selectedStudio?.settings.allowed_durations_minutes ?? [];

  const selectedSlot = useMemo(
    () =>
      slots.find(
        (slot) =>
          `${slot.start_at}|${slot.duration_minutes}` === selectedKey,
      ) ?? null,
    [slots, selectedKey],
  );

  const availableTables = selectedSlot?.available_tables ?? [];

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

    if (!availableDurations.includes(duration)) {
      setDuration(availableDurations[0] ?? 60);
    }

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
    setSelectedKey("");
    setSelectedTableId("");

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

    setSelectedKey(key);
    setSelectedTableId(slot.available_tables[0]?.id ?? "");
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
                  setSelectedKey("");
                  setSelectedTableId("");
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

              <input
                id="booking-date"
                type="date"
                min={minDate}
                max={maxDate}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-12 w-full min-w-0 rounded-xl border border-white/15 bg-[#101326] px-3 text-sm text-white outline-none focus:border-[#8F5BFF]"
              />
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
                  const active = key === selectedKey;

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

          {selectedSlot && availableTables.length > 0 && (
            <div className="space-y-4 rounded-xl border border-[#8F5BFF]/25 bg-[#6B30CE]/10 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Table2
                  size={20}
                  className="mt-0.5 shrink-0 text-[#A77BFF]"
                />

                <div>
                  <p className="text-sm font-semibold text-white">
                    Выберите стол
                  </p>

                  <p className="mt-1 text-xs leading-5 text-white/50">
                    Наличие будет повторно проверено сервером при
                    создании брони.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {availableTables.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => setSelectedTableId(table.id)}
                    className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                      selectedTableId === table.id
                        ? "border-[#A77BFF] bg-[#6B30CE]/30 text-white"
                        : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]"
                    }`}
                  >
                    {table.name}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <span className="text-sm text-white/60">
                  Итого за сеанс
                </span>

                <span className="text-xl font-semibold text-white">
                  {money(selectedSlot.price_rub)}
                </span>
              </div>

              <p className="text-xs leading-5 text-white/45">
                Выбор пока не создаёт бронь и не списывает деньги.
                Подтверждение бронирования и платёжный модуль подключим
                отдельным этапом.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
