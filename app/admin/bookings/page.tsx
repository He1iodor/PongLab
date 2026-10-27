"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";

type Club = {
  id: string;
  name: string;
  is_active: boolean;
};

type Booking = {
  id: string;
  client_phone: string | null;

  table_id: string;
  table_name: string;

  studio_id: string | null;
  studio_name: string;
  studio_address: string | null;
  timezone: string;

  start_at: string;
  end_at: string;

  status: string;
  effective_status: string;

  payment_status: string;
  price_rub: number;

  payment_provider: string | null;
  hold_expires_at: string | null;
  payment_started: boolean;

  created_at: string;
  updated_at: string;
};

type StatusFilter =
  | "all"
  | "pending_payment"
  | "confirmed"
  | "expired"
  | "cancelled"
  | "completed";

const cardClass =
  "rounded-2xl border border-white/10 bg-[#151121] p-5 sm:p-6";

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-3 py-3 text-sm text-white outline-none focus:border-violet-400";

function validTimeZone(
  timeZone: string | null | undefined,
) {
  try {
    new Intl.DateTimeFormat("ru-RU", {
      timeZone: timeZone || "Europe/Moscow",
    });

    return timeZone || "Europe/Moscow";
  } catch {
    return "Europe/Moscow";
  }
}

function formatDateTime(
  value: string,
  timeZone: string,
) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Дата не указана";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: validTimeZone(timeZone),
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dateInTimeZone(
  value: string,
  timeZone: string,
) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: validTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatRubles(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function statusLabel(status: string) {
  switch (status) {
    case "pending_payment":
      return "Временный резерв";

    case "confirmed":
      return "Подтверждена";

    case "expired":
      return "Резерв истёк";

    case "cancelled":
      return "Отменена";

    case "completed":
      return "Завершена";

    default:
      return status || "Неизвестно";
  }
}

function statusClass(status: string) {
  switch (status) {
    case "pending_payment":
      return "border-amber-300/20 bg-amber-300/10 text-amber-200";

    case "confirmed":
      return "border-emerald-300/20 bg-emerald-300/10 text-emerald-200";

    case "expired":
    case "cancelled":
      return "border-white/10 bg-white/5 text-white/50";

    case "completed":
      return "border-sky-300/20 bg-sky-300/10 text-sky-200";

    default:
      return "border-white/10 bg-white/5 text-white/60";
  }
}

function paymentLabel(status: string) {
  switch (status) {
    case "succeeded":
      return "Оплачено";

    case "cancelled":
      return "Платёж отменён";

    case "failed":
      return "Ошибка оплаты";

    case "pending":
      return "Ожидает оплаты";

    default:
      return status || "Неизвестно";
  }
}

export default function AdminBookingsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [studioId, setStudioId] = useState("all");

  const [bookings, setBookings] = useState<Booking[]>([]);

  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const [loadingClubs, setLoadingClubs] = useState(true);
  const [loadingBookings, setLoadingBookings] = useState(true);

  const [cancellingId, setCancellingId] =
    useState<string | null>(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadClubs = useCallback(async () => {
    setLoadingClubs(true);
    setError("");

    try {
      const response = await fetch("/api/admin/clubs", {
        cache: "no-store",
        credentials: "same-origin",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || "Не удалось загрузить список клубов.",
        );
      }

      setClubs(
        Array.isArray(data.clubs) ? data.clubs : [],
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Ошибка загрузки клубов.",
      );
    } finally {
      setLoadingClubs(false);
    }
  }, []);

  const loadBookings = useCallback(async () => {
    if (loadingClubs) return;

    setLoadingBookings(true);
    setError("");

    try {
      const query = new URLSearchParams();

      if (studioId !== "all") {
        query.set("studio_id", studioId);
      }

      const response = await fetch(
        `/api/admin/bookings?${query.toString()}`,
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Не удалось загрузить бронирования.",
        );
      }

      setBookings(
        Array.isArray(data.bookings)
          ? data.bookings
          : [],
      );
    } catch (loadError) {
      setBookings([]);

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Ошибка загрузки бронирований.",
      );
    } finally {
      setLoadingBookings(false);
    }
  }, [studioId, loadingClubs]);

  useEffect(() => {
    void loadClubs();
  }, [loadClubs]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  async function cancelBooking(booking: Booking) {
    if (
      booking.effective_status !== "pending_payment" ||
      booking.payment_started
    ) {
      return;
    }

    const confirmed = window.confirm(
      "Отменить временный резерв? Стол и это время снова станут доступны для бронирования.",
    );

    if (!confirmed) return;

    setCancellingId(booking.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/bookings", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "cancel",
          booking_id: booking.id,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || "Не удалось отменить бронь.",
        );
      }

      setMessage(
        "Временный резерв отменён. Время снова доступно.",
      );

      await loadBookings();
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "Ошибка отмены бронирования.",
      );
    } finally {
      setCancellingId(null);
    }
  }

  const visibleBookings = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLocaleLowerCase("ru-RU");

    return [...bookings]
      .filter((booking) => {
        if (
          statusFilter !== "all" &&
          booking.effective_status !== statusFilter
        ) {
          return false;
        }

        const localDate = dateInTimeZone(
          booking.start_at,
          booking.timezone,
        );

        if (dateFrom && localDate < dateFrom) {
          return false;
        }

        if (dateTo && localDate > dateTo) {
          return false;
        }

        if (normalizedSearch) {
          const haystack = [
            booking.client_phone ?? "",
            booking.studio_name,
            booking.studio_address ?? "",
            booking.table_name,
            booking.id,
          ]
            .join(" ")
            .toLocaleLowerCase("ru-RU");

          if (!haystack.includes(normalizedSearch)) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const aActive =
          a.effective_status === "pending_payment" ||
          a.effective_status === "confirmed";

        const bActive =
          b.effective_status === "pending_payment" ||
          b.effective_status === "confirmed";

        if (aActive !== bActive) {
          return aActive ? -1 : 1;
        }

        return Date.parse(a.start_at) - Date.parse(b.start_at);
      });
  }, [bookings, statusFilter, dateFrom, dateTo, search]);

  return (
    <main className="min-h-screen bg-[#0b0914] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin"
          className="text-sm text-violet-300 transition hover:text-violet-200"
        >
          ← Панель владельца
        </Link>

        <header className="mt-6 flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.24em] text-violet-300">
              PONGLAB · УПРАВЛЕНИЕ
            </p>

            <h1 className="mt-3 text-3xl font-semibold">
              Бронирования
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
              Временный резерв действует до указанного срока.
              Сейчас платёжный провайдер ещё не подключён, поэтому
              резерв не считается оплаченным и сам по себе не даёт
              доступ в студию.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadBookings()}
            disabled={loadingBookings || loadingClubs}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingBookings ? "Обновляем…" : "Обновить список"}
          </button>
        </header>

        {message && (
          <p className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
            {message}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200"
          >
            {error}
          </p>
        )}

        <section className={`${cardClass} mt-6`}>
          <h2 className="font-semibold">Фильтры</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="block text-sm sm:col-span-2 lg:col-span-1">
              Клуб
              <select
                value={studioId}
                onChange={(event) =>
                  setStudioId(event.target.value)
                }
                disabled={loadingClubs}
                className={inputClass}
              >
                <option value="all">Все клубы</option>

                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.name}
                    {club.is_active ? "" : " (отключён)"}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              Статус
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as StatusFilter,
                  )
                }
                className={inputClass}
              >
                <option value="all">Все статусы</option>
                <option value="pending_payment">
                  Временный резерв
                </option>
                <option value="confirmed">
                  Подтверждённые
                </option>
                <option value="expired">
                  Истёкшие резервы
                </option>
                <option value="cancelled">
                  Отменённые
                </option>
                <option value="completed">
                  Завершённые
                </option>
              </select>
            </label>

            <label className="block text-sm">
              Дата начала
              <input
                type="date"
                value={dateFrom}
                onChange={(event) =>
                  setDateFrom(event.target.value)
                }
                className={inputClass}
              />
            </label>

            <label className="block text-sm">
              Дата окончания
              <input
                type="date"
                value={dateTo}
                onChange={(event) =>
                  setDateTo(event.target.value)
                }
                min={dateFrom || undefined}
                className={inputClass}
              />
            </label>

            <label className="block text-sm sm:col-span-2 lg:col-span-1">
              Поиск
              <input
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Телефон, клуб, стол…"
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/45">
              Найдено: {visibleBookings.length}
            </p>

            <button
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setDateFrom("");
                setDateTo("");
                setSearch("");
              }}
              className="text-sm text-violet-300 transition hover:text-violet-200"
            >
              Сбросить фильтры
            </button>
          </div>
        </section>

        <section className="mt-6 space-y-4">
          {loadingBookings && (
            <div className={cardClass}>
              <p className="text-sm text-white/55">
                Загружаем бронирования…
              </p>
            </div>
          )}

          {!loadingBookings &&
            !error &&
            visibleBookings.length === 0 && (
              <div className={cardClass}>
                <h2 className="font-semibold">
                  Бронирования не найдены
                </h2>

                <p className="mt-2 text-sm leading-6 text-white/50">
                  Попробуйте сбросить фильтры или выбрать другой клуб.
                </p>
              </div>
            )}

          {!loadingBookings &&
            visibleBookings.map((booking) => (
              <article key={booking.id} className={cardClass}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs text-white/45">
                      {formatDateTime(
                        booking.start_at,
                        booking.timezone,
                      )}
                    </p>

                    <h2 className="mt-1 text-lg font-semibold">
                      {booking.studio_name} · {booking.table_name}
                    </h2>

                    <p className="mt-1 text-sm text-white/55">
                      До{" "}
                      {formatDateTime(
                        booking.end_at,
                        booking.timezone,
                      )}
                    </p>
                  </div>

                  <span
                    className={`inline-flex w-fit rounded-full border px-3 py-1.5 text-xs font-medium ${statusClass(booking.effective_status)}`}
                  >
                    {statusLabel(booking.effective_status)}
                  </span>
                </div>

                <div className="mt-5 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-white/40">
                      Телефон клиента
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {booking.client_phone || "Телефон не найден"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-white/40">
                      Стоимость
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {formatRubles(booking.price_rub)}
                    </p>
                    <p className="mt-1 text-xs text-white/40">
                      {paymentLabel(booking.payment_status)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-white/40">
                      Адрес
                    </p>
                    <p className="mt-1 text-sm">
                      {booking.studio_address || "Не указан"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-white/40">
                      Создана
                    </p>
                    <p className="mt-1 text-sm">
                      {formatDateTime(
                        booking.created_at,
                        booking.timezone,
                      )}
                    </p>
                  </div>
                </div>

                {booking.effective_status === "pending_payment" &&
                  booking.hold_expires_at && (
                    <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100/85">
                      Временный резерв действует до{" "}
                      {formatDateTime(
                        booking.hold_expires_at,
                        booking.timezone,
                      )}
                      . Это не подтверждённая оплата.
                    </p>
                  )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <p className="text-xs text-white/35">
                    ID: {booking.id}
                  </p>

                  {booking.effective_status === "pending_payment" &&
                    !booking.payment_started && (
                      <button
                        type="button"
                        onClick={() =>
                          void cancelBooking(booking)
                        }
                        disabled={cancellingId === booking.id}
                        className="rounded-xl border border-red-300/20 px-4 py-2.5 text-sm font-medium text-red-200 transition hover:bg-red-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {cancellingId === booking.id
                          ? "Отменяем…"
                          : "Отменить временный резерв"}
                      </button>
                    )}
                </div>
              </article>
            ))}
        </section>

        <p className="mt-6 text-xs leading-5 text-white/35">
          Загружаются последние 500 записей. Отмена подтверждённой
          брони и платёжные возвраты требуют отдельной платёжной логики.
        </p>
      </div>
    </main>
  );
}
