"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, RefreshCw, Sparkles } from "lucide-react";

type Offer = {
  id: string;
  status: "offered" | "awaiting_payment";
  booking_id: string;
  table_name: string;
  studio_name: string;
  timezone: string;
  source_end_at: string;
  target_end_at: string;
  amount_rub: number;
  base_price_rub: number | null;
  discount_percent: number | null;
  expires_at: string | null;
  payment_group_id: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function clock(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "long",
      timeZone: timezone || "Europe/Moscow",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function BookingExtensionOffers() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/account/extension-offers", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить предложения.");
      setOffers(Array.isArray(data.offers) ? data.offers : []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки предложений.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const pay = async (offer: Offer) => {
    if (busyId) return;
    setBusyId(offer.id);
    setError("");

    try {
      let paymentGroupId = offer.payment_group_id;

      if (offer.status === "offered" || !paymentGroupId) {
        const accepted = await fetch("/api/account/extension-offers/accept", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation_id: offer.id }),
        });
        const acceptedData = await accepted.json().catch(() => ({}));
        if (!accepted.ok || typeof acceptedData.payment_group_id !== "string") {
          throw new Error(acceptedData.error || "Предложение уже недоступно.");
        }
        paymentGroupId = acceptedData.payment_group_id;
      }

      const payment = await fetch("/api/payments/create", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_group_id: paymentGroupId }),
      });
      const paymentData = await payment.json().catch(() => ({}));

      if (!payment.ok) {
        if (paymentData.state === "succeeded") {
          await load();
          return;
        }
        throw new Error(paymentData.error || "Не удалось начать оплату продления.");
      }

      if (paymentData.state === "succeeded") {
        await load();
        return;
      }

      if (typeof paymentData.confirmation_url !== "string") {
        throw new Error("Платёж создан, но ссылка для оплаты не получена. Обновите страницу.");
      }

      window.location.assign(paymentData.confirmation_url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось обработать предложение.");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading && offers.length === 0) return null;

  return (
    <section className="mb-5 space-y-3" aria-label="Предложения продления">
      {error && (
        <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {offers.map((offer) => (
        <article key={offer.id} className="rounded-2xl border border-violet-300/25 bg-violet-400/[0.07] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Sparkles size={17} className="text-violet-200" />
              {offer.status === "offered" ? "Специальное предложение" : "Продление ожидает оплаты"}
            </div>
            <span className="rounded-full border border-violet-200/20 bg-violet-200/10 px-3 py-1 text-xs text-violet-100">
              Ещё 60 минут
            </span>
          </div>

          <p className="mt-3 text-sm leading-6 text-white/75">
            Следующий час на столе «{offer.table_name}» в клубе «{offer.studio_name}» свободен.
            Продлите текущую сессию до {clock(offer.target_end_at, offer.timezone)}.
          </p>

          <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
            <div>
              <p className="text-xs text-white/45">Цена продления</p>
              <p className="mt-1 text-2xl font-semibold text-white">{money(offer.amount_rub)}</p>
            </div>
            {offer.discount_percent !== null && (
              <p className="text-sm text-emerald-200">Скидка {offer.discount_percent}%</p>
            )}
            {offer.base_price_rub !== null && (
              <p className="text-xs text-white/40">Обычная цена: {money(offer.base_price_rub)}</p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
            <p className="flex items-center gap-2 text-xs text-white/45">
              <Clock3 size={14} />
              {offer.status === "offered"
                ? `Предложение действует до ${clock(offer.expires_at || offer.source_end_at, offer.timezone)}`
                : `Резерв оплаты до ${clock(offer.expires_at || offer.source_end_at, offer.timezone)}`}
            </p>
            <button
              type="button"
              onClick={() => void pay(offer)}
              disabled={busyId !== null}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyId === offer.id ? <RefreshCw size={15} className="animate-spin" /> : offer.status === "offered" ? <CheckCircle2 size={15} /> : null}
              {busyId === offer.id ? "Проверяем…" : offer.status === "offered" ? "Принять и оплатить" : "Продолжить оплату"}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
