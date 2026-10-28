"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type CustomerBooking = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  payment_status: string;
  price_rub: number;
  created_at: string;
};

type Customer = {
  id: string;
  phone: string | null;
  created_at: string;
  booking_count: number;
  paid_booking_count: number;
  paid_total_rub: number;
  last_booking_at: string | null;
  bookings: CustomerBooking[];
};

const cardClass =
  "rounded-2xl border border-white/10 bg-[#151121] p-5 sm:p-6";
const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-3 py-3 text-sm text-white outline-none focus:border-violet-400";

function formatDate(value: string | null | undefined) {
  if (!value) return "Нет данных";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Нет данных";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRubles(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function bookingStatus(status: string) {
  switch (status) {
    case "pending_payment": return "Временный резерв";
    case "confirmed": return "Подтверждена";
    case "expired": return "Резерв истёк";
    case "cancelled": return "Отменена";
    case "completed": return "Завершена";
    default: return status || "Неизвестно";
  }
}

function paymentStatus(status: string) {
  switch (status) {
    case "succeeded": return "Оплачено";
    case "pending": return "Ожидает оплаты";
    case "cancelled": return "Платёж отменён";
    case "failed": return "Ошибка оплаты";
    default: return status || "Неизвестно";
  }
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/customers", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Не удалось загрузить клиентов.");
      }
      setCustomers(Array.isArray(data.customers) ? data.customers : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Ошибка загрузки клиентов.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const visibleCustomers = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("ru-RU");
    return customers.filter((customer) => {
      if (!normalized) return true;
      return (customer.phone ?? "").toLocaleLowerCase("ru-RU").includes(normalized);
    });
  }, [customers, search]);

  const paidRevenue = customers.reduce(
    (sum, customer) => sum + customer.paid_total_rub,
    0,
  );
  const bookingCount = customers.reduce(
    (sum, customer) => sum + customer.booking_count,
    0,
  );

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
            <h1 className="mt-3 text-3xl font-semibold">Клиенты</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
              Список клиентских профилей и краткая история бронирований. Данные доступны только владельцу.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadCustomers()}
            disabled={loading}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Обновляем…" : "Обновить список"}
          </button>
        </header>

        {error && (
          <p role="alert" className="mt-6 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
            {error}
          </p>
        )}

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className={cardClass}>
            <p className="text-sm text-white/50">Клиентских профилей</p>
            <p className="mt-2 text-2xl font-semibold">{customers.length}</p>
          </div>
          <div className={cardClass}>
            <p className="text-sm text-white/50">Бронирований в загруженной истории</p>
            <p className="mt-2 text-2xl font-semibold">{bookingCount}</p>
          </div>
          <div className={cardClass}>
            <p className="text-sm text-white/50">Сумма успешных платежей</p>
            <p className="mt-2 text-2xl font-semibold">{formatRubles(paidRevenue)}</p>
          </div>
        </section>

        <section className={`${cardClass} mt-6`}>
          <label className="block max-w-md text-sm">
            Поиск по телефону
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Введите номер телефона"
              className={inputClass}
            />
          </label>
          <p className="mt-4 text-xs text-white/45">
            Найдено клиентов: {visibleCustomers.length}. Для каждого профиля показываются последние 5 бронирований, если они есть.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          {loading && (
            <div className={cardClass}>
              <p className="text-sm text-white/55">Загружаем клиентов…</p>
            </div>
          )}

          {!loading && !error && visibleCustomers.length === 0 && (
            <div className={cardClass}>
              <h2 className="font-semibold">Клиенты не найдены</h2>
              <p className="mt-2 text-sm text-white/50">
                {search ? "Измените поисковый запрос." : "В базе пока нет клиентских профилей."}
              </p>
            </div>
          )}

          {!loading && visibleCustomers.map((customer) => {
            const expanded = expandedId === customer.id;
            return (
              <article key={customer.id} className={cardClass}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs text-white/45">Телефон клиента</p>
                    <h2 className="mt-1 break-all text-lg font-semibold">
                      {customer.phone || "Телефон не указан"}
                    </h2>
                    <p className="mt-2 text-sm text-white/50">
                      Регистрация: {formatDate(customer.created_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : customer.id)}
                    className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium transition hover:bg-white/5"
                    aria-expanded={expanded}
                  >
                    {expanded ? "Скрыть историю" : "История бронирований"}
                  </button>
                </div>

                <div className="mt-5 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-white/40">Всего бронирований</p>
                    <p className="mt-1 text-sm font-medium">{customer.booking_count}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Бронирований с успешной оплатой</p>
                    <p className="mt-1 text-sm font-medium">{customer.paid_booking_count}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Сумма успешных платежей</p>
                    <p className="mt-1 text-sm font-medium">{formatRubles(customer.paid_total_rub)}</p>
                    <p className="mt-1 text-xs text-white/40">Последняя бронь создана: {formatDate(customer.last_booking_at)}</p>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-5 border-t border-white/10 pt-4">
                    <h3 className="font-semibold">Последние бронирования</h3>
                    {customer.bookings.length === 0 ? (
                      <p className="mt-3 text-sm text-white/50">У клиента пока нет бронирований.</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {customer.bookings.map((booking) => (
                          <div key={booking.id} className="rounded-xl border border-white/10 bg-black/10 p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-sm font-medium">{formatDate(booking.start_at)} — {formatDate(booking.end_at)}</p>
                                <p className="mt-1 text-xs text-white/45">Создана: {formatDate(booking.created_at)}</p>
                              </div>
                              <p className="text-sm font-semibold">{formatRubles(booking.price_rub)}</p>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <span className="rounded-full border border-white/10 px-3 py-1.5 text-white/70">{bookingStatus(booking.status)}</span>
                              <span className="rounded-full border border-white/10 px-3 py-1.5 text-white/70">{paymentStatus(booking.payment_status)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <p className="mt-6 text-xs leading-5 text-white/35">
          Ограничение текущей версии: загружается до 1 000 клиентских профилей и до 5 000 последних бронирований. История в карточке показывает до 5 последних бронирований клиента.
        </p>
      </div>
    </main>
  );
}
