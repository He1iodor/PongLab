"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, WalletCards } from "lucide-react";
import BookingPassTransferAction from "@/components/BookingPassTransferAction";

type Booking = { id: string; start_at: string; studio_name: string; timezone: string; status: string; studio_id: string | null; transfer_used: boolean; transfer_blocked: boolean; };
type Service = { id: string; title: string; allocated_amount_rub: number; refunded_amount_rub: number; status: string };
type Extra = {
  funding_method: "cash" | "pass";
  pass_name: string | null;
  pass_city_id: string | null;
  transfer_deadline_at: string | null;
  pass_remaining_hours: number | null;
  pass_reserved_hours: number | null;
  pass_expires_at: string | null;
  pass_timezone: string | null;
  booking_services: Service[];
  service_refund_state: string | null;
  service_refund_amount_rub: number;
  service_refund_failure_reason: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value || 0);
}

function dateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: timezone || "Europe/Moscow" }).format(new Date(value));
}

function lastValidDate(value: string | null, timezone: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  date.setTime(date.getTime() - 1);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: timezone || "Europe/Moscow" }).format(date);
}

function refundLabel(state: string | null) {
  if (state === "completed") return "Возврат услуг подтверждён";
  if (state === "pending" || state === "processing") return "Возврат услуг обрабатывается";
  if (state === "retry_required") return "Возврат услуг требует повторной проверки";
  return "Возврат услуг не требуется";
}

export default function AccountBookingExtrasPanel() {
  const [rows, setRows] = useState<Array<{ booking: Booking; extra: Extra }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [bookingsResponse, extrasResponse] = await Promise.all([
        fetch("/api/account/bookings", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/account/bookings/extra", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const [bookingsResult, extrasResult] = await Promise.all([
        bookingsResponse.json().catch(() => ({})),
        extrasResponse.json().catch(() => ({})),
      ]);
      if (!bookingsResponse.ok || !extrasResponse.ok) {
        throw new Error(extrasResult.error || bookingsResult.error || "Не удалось загрузить сведения по абонементам и услугам.");
      }
      const bookings: Booking[] = Array.isArray(bookingsResult.bookings) ? bookingsResult.bookings : [];
      const extras = extrasResult.extras && typeof extrasResult.extras === "object" ? extrasResult.extras as Record<string, Extra> : {};
      setRows(bookings.flatMap((booking) => {
        const extra = extras[booking.id];
        return extra && (extra.funding_method === "pass" || extra.booking_services?.length > 0)
          ? [{ booking, extra }]
          : [];
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки дополнительных сведений.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("ponglab:bookings-refresh", refresh);
    return () => window.removeEventListener("ponglab:bookings-refresh", refresh);
  }, [load]);

  const retryServiceRefund = async (bookingId: string) => {
    if (retryingId) return;
    setRetryingId(bookingId);
    setError("");
    try {
      const response = await fetch("/api/account/bookings/cancel", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 202) throw new Error(result.error || "Не удалось повторить возврат услуг.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка повторного возврата.");
    } finally {
      setRetryingId(null);
    }
  };

  if (loading) return <div className="flex items-center gap-2 py-4 text-xs text-white/45"><RefreshCw size={14} className="animate-spin" /> Загружаем сведения по абонементам и услугам…</div>;
  if (error) return <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3 text-xs text-red-100">{error}</div>;
  if (rows.length === 0) return null;

  return (
    <section className="mt-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Абонементы и дополнительные услуги</h3>
          <p className="mt-1 text-xs text-white/40">Источник оплаты и отдельный статус возврата услуг.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] text-white/55 hover:bg-white/[0.05]"><RefreshCw size={12} /> Обновить</button>
      </div>
      {rows.map(({ booking, extra }) => (
        <article key={booking.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">{dateTime(booking.start_at, booking.timezone)}</p>
              <p className="mt-1 text-xs text-white/45">{booking.studio_name}</p>
            </div>
            {extra.funding_method === "pass" && <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-400/[0.06] px-2.5 py-1 text-[11px] text-violet-100"><WalletCards size={12} /> Оплачено абонементом</span>}
          </div>

          {extra.funding_method === "pass" && (
            <div className="mt-3 rounded-lg border border-violet-400/15 bg-violet-400/[0.04] p-3 text-xs text-white/65">
              <p className="font-medium text-white">{extra.pass_name || "Абонемент"}</p>
              <p className="mt-1">Баланс: {extra.pass_remaining_hours ?? "—"} ч.; зарезервировано: {extra.pass_reserved_hours ?? "—"} ч.</p>
              <p className="mt-1">Доступно: {extra.pass_remaining_hours ?? "—"} ч.</p>
              <p className="mt-1">Абонемент действует до конца {lastValidDate(extra.pass_expires_at, extra.pass_timezone)}.</p>
            </div>
          )}

          {extra.funding_method === "pass" &&
            booking.status === "confirmed" &&
            !booking.transfer_used &&
            !booking.transfer_blocked &&
            extra.pass_city_id &&
            extra.transfer_deadline_at && (
              <BookingPassTransferAction
                bookingId={booking.id}
                startAt={booking.start_at}
                studioId={booking.studio_id}
                timezone={booking.timezone}
                passCityId={extra.pass_city_id}
                transferDeadlineAt={extra.transfer_deadline_at}
                onComplete={() => {
                  void load();
                  window.dispatchEvent(new Event("ponglab:bookings-refresh"));
                }}
              />
            )}

          {extra.booking_services?.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-white/65">Услуги</p>
              {extra.booking_services.map((service) => (
                <div key={service.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/10 px-3 py-2 text-xs">
                  <span className="text-white/75">{service.title}</span>
                  <span className="text-white/60">{money(service.allocated_amount_rub)}{service.refunded_amount_rub > 0 ? ` · возвращено ${money(service.refunded_amount_rub)}` : ""}</span>
                </div>
              ))}
            </div>
          )}

          {extra.service_refund_state && (
            <div className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-xs ${extra.service_refund_state === "completed" ? "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-100" : extra.service_refund_state === "retry_required" ? "border-amber-300/20 bg-amber-300/[0.05] text-amber-100" : "border-white/10 bg-black/10 text-white/65"}`}>
              {extra.service_refund_state === "completed" ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : extra.service_refund_state === "retry_required" ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <Clock3 size={14} className="mt-0.5 shrink-0" />}
              <div>
                <p className="font-medium">{refundLabel(extra.service_refund_state)}</p>
                {extra.service_refund_amount_rub > 0 && <p className="mt-1">Сумма возврата: {money(extra.service_refund_amount_rub)}</p>}
                {extra.service_refund_failure_reason && <p className="mt-1">Причина: {extra.service_refund_failure_reason}</p>}
                {extra.service_refund_state === "retry_required" && (
                  <button type="button" onClick={() => void retryServiceRefund(booking.id)} disabled={Boolean(retryingId)} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-200/25 px-2.5 text-[11px] font-medium text-amber-100 disabled:opacity-50">
                    {retryingId === booking.id ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />} Повторить возврат услуг
                  </button>
                )}
              </div>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
