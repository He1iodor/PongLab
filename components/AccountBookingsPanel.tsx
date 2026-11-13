"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, DoorOpen, MapPin, RefreshCw, Table2, Wifi, WifiOff } from "lucide-react";

type Booking = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  effective_status: string;
  payment_status: string;
  payment_failure_reason: string | null;
  price_rub: number;
  payment_init_started_at: string | null;
  payment_id: string | null;
  payment_group_id: string | null;
  hold_expires_at: string | null;
  table_name: string;
  studio_name: string;
  studio_address: string | null;
  timezone: string;
  door_controller_available: boolean;
  door_controller_online: boolean;
  door_state: "open" | "closed" | "unknown" | null;
  door_last_seen_at: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value || 0);
}
function dateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: timezone || "Europe/Moscow" }).format(new Date(value));
}
function clockTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: timezone || "Europe/Moscow" }).format(new Date(value));
}
function formatLastSeen(value: string | null) {
  if (!value) return "время сигнала неизвестно";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "время сигнала неизвестно";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(date);
}
function statusLabel(booking: Booking) {
  if (booking.effective_status === "expired" || booking.status === "expired") return "Резерв истёк";
  if (booking.status === "cancelled") return "Отменена";
  if (booking.status === "completed") return "Завершена";
  if (booking.status === "confirmed" && booking.payment_status === "succeeded") return "Оплачена и подтверждена";
  if (booking.status === "pending_payment") return "Ожидает оплаты";
  return booking.status;
}
function isPaymentPending(booking: Booking) {
  return booking.status === "pending_payment" && booking.payment_status === "pending" &&
    Boolean(booking.payment_init_started_at || booking.payment_id) && Boolean(booking.payment_group_id);
}

function DoorAccess({ booking, now }: { booking: Booking; now: number }) {
  const [sending, setSending] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"info" | "success" | "error">("info");

  const start = Date.parse(booking.start_at);
  const end = Date.parse(booking.end_at);
  const inWindow = Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
  const confirmed = booking.status === "confirmed" && booking.payment_status === "succeeded";

  useEffect(() => {
    if (!expiresAt) return;
    if (booking.door_controller_online && booking.door_state === "open") {
      setMessage("Датчик подтвердил открытое состояние двери.");
      setMessageKind("success");
      setExpiresAt(null);
      return;
    }
    if (Date.parse(expiresAt) <= now) {
      setMessage("Контроллер не подтвердил открытие за отведённое время. Проверьте дверь или обратитесь к администратору.");
      setMessageKind("error");
      setExpiresAt(null);
    }
  }, [expiresAt, now, booking.door_controller_online, booking.door_state]);

  const openDoor = async () => {
    if (sending || !inWindow || !confirmed || !booking.door_controller_available || !booking.door_controller_online) return;
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/door/unlock", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: booking.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось отправить команду.");
      setExpiresAt(result.expires_at || new Date(Date.now() + 15000).toISOString());
      setMessage("Команда поставлена в очередь. Ожидаем подтверждение от датчика двери.");
      setMessageKind("info");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Ошибка отправки команды.");
      setMessageKind("error");
    } finally {
      setSending(false);
    }
  };

  if (!confirmed) return null;

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-white"><DoorOpen size={17} className="text-[#B99AFF]" />Доступ в студию</div>
        {booking.door_controller_online
          ? <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><Wifi size={14} />Контроллер на связи</span>
          : <span className="inline-flex items-center gap-1 text-xs text-amber-200"><WifiOff size={14} />Нет связи</span>}
      </div>

      {booking.door_controller_available ? (
        <p className="mt-2 text-xs leading-5 text-white/55">
          {booking.door_controller_online
            ? `Последний сигнал: ${formatLastSeen(booking.door_last_seen_at)}. Состояние двери: ${booking.door_state === "open" ? "открыта" : booking.door_state === "closed" ? "закрыта" : "не определено"}.`
            : `Последнее известное состояние: ${booking.door_state === "open" ? "открыта" : booking.door_state === "closed" ? "закрыта" : "не определено"}. Последний сигнал: ${formatLastSeen(booking.door_last_seen_at)}. Это не текущее состояние двери.`}
        </p>
      ) : (
        <p className="mt-2 text-xs leading-5 text-white/55">В клубе нет единственного активного дверного контроллера. Открытие через кабинет недоступно.</p>
      )}

      {inWindow && booking.door_controller_online && booking.door_state === "open" ? (
        <p className="mt-3 text-sm font-medium text-emerald-300">Датчик сообщает, что дверь открыта.</p>
      ) : (
        <button onClick={() => void openDoor()} disabled={!inWindow || !booking.door_controller_available || !booking.door_controller_online || sending} className="mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6B30CE] to-[#8F5BFF] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
          {sending ? <RefreshCw size={15} className="animate-spin" /> : <DoorOpen size={16} />}
          {sending ? "Отправляем..." : "Открыть дверь"}
        </button>
      )}

      {!inWindow && <p className="mt-2 text-xs text-white/40">Кнопка доступа активируется только во время оплаченного бронирования.</p>}
      {!booking.door_controller_online && booking.door_controller_available && <p className="mt-2 text-xs text-amber-100/70">Команда заблокирована до восстановления связи с контроллером.</p>}
      {message && <p role="status" className={`mt-3 text-xs leading-5 ${messageKind === "success" ? "text-emerald-300" : messageKind === "error" ? "text-red-300" : "text-[#D6C5FF]"}`}>{message}</p>}
    </div>
  );
}

export default function AccountBookingsPanel({ onCreateBooking }: { onCreateBooking: () => void }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/account/bookings", { credentials: "same-origin", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось загрузить бронирования.");
      setBookings(Array.isArray(result.bookings) ? result.bookings : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки бронирований.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const pendingIds = useMemo(() => [...new Set(bookings.filter(isPaymentPending).map((b) => b.payment_group_id).filter((id): id is string => Boolean(id)))].slice(0, 5), [bookings]);

  useEffect(() => {
    if (pendingIds.length === 0) return;
    let stopped = false;
    const check = async () => {
      const results = await Promise.all(pendingIds.map(async (id) => {
        try {
          const response = await fetch(`/api/payments/status?payment_group_id=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" });
          if (!response.ok) return false;
          const result = await response.json().catch(() => ({}));
          return result.state === "succeeded" || result.state === "cancelled";
        } catch { return false; }
      }));
      if (!stopped && results.some(Boolean)) await load(true);
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, 30000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [pendingIds, load]);

  const activeConfirmed = bookings.some((b) => b.status === "confirmed" && b.payment_status === "succeeded" && Date.parse(b.start_at) <= now && now < Date.parse(b.end_at));
  useEffect(() => {
    if (!activeConfirmed) return;
    const timer = window.setInterval(() => { void load(true); }, 15000);
    return () => window.clearInterval(timer);
  }, [activeConfirmed, load]);

  const sorted = [...bookings].sort((a, b) => {
    const aStart = Date.parse(a.start_at), bStart = Date.parse(b.start_at);
    const aFuture = aStart >= now, bFuture = bStart >= now;
    if (aFuture && !bFuture) return -1;
    if (!aFuture && bFuture) return 1;
    return aFuture ? aStart - bStart : bStart - aStart;
  });

  if (loading) return <div className="flex items-center gap-3 py-8 text-sm text-white/60"><RefreshCw size={18} className="animate-spin" />Загружаем бронирования...</div>;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/50">Будущие брони, текущие посещения и история.</p>
        <button onClick={() => void load(true)} disabled={refreshing} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-white/70 hover:bg-white/[0.06] disabled:opacity-50"><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />Обновить</button>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 text-center"><CalendarDays size={26} className="mx-auto text-[#B99AFF]" /><h3 className="mt-3 font-semibold text-white">Бронирований пока нет</h3><p className="mt-2 text-sm text-white/50">Создайте первую бронь, чтобы она появилась здесь.</p><button onClick={onCreateBooking} className="mt-4 h-11 rounded-xl bg-[#7540D8] px-5 text-sm font-semibold text-white">Создать бронь</button></div>
      ) : (
        <div className="space-y-3">
          {sorted.map((booking) => {
            const pending = isPaymentPending(booking);
            return (
              <article key={booking.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="flex items-center gap-2 font-semibold text-white"><CalendarDays size={16} className="text-[#B99AFF]" />{dateTime(booking.start_at, booking.timezone)}</h3><p className="mt-2 flex items-center gap-2 text-sm text-white/55"><Clock3 size={14} />До {clockTime(booking.end_at, booking.timezone)}</p></div>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70">{statusLabel(booking)}</span>
                </div>
                <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
                  <div className="flex gap-2"><MapPin size={15} className="mt-0.5 text-white/40" /><div><p className="text-xs text-white/40">Клуб</p><p className="mt-1 text-sm text-white/80">{booking.studio_name}</p>{booking.studio_address && <p className="mt-1 text-xs text-white/45">{booking.studio_address}</p>}</div></div>
                  <div className="flex gap-2"><Table2 size={15} className="mt-0.5 text-white/40" /><div><p className="text-xs text-white/40">Стол</p><p className="mt-1 text-sm text-white/80">{booking.table_name}</p></div></div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4"><span className="text-sm text-white/50">Стоимость</span><span className="font-semibold text-white">{money(booking.price_rub)}</span></div>
                {pending && <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100/80">Платёж уже инициирован. Система проверяет его каждые 30 секунд, пока этот раздел открыт. Не создавайте повторную бронь до окончательного статуса.</div>}
                {booking.status === "confirmed" && booking.payment_status === "succeeded" && <DoorAccess booking={booking} now={now} />}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
