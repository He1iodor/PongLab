
"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, Sparkles } from "lucide-react";

type ExtensionOffer = {
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

type Props = {
  bookingId: string;
  onComplete: () => void;
};

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function time(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone || "Europe/Moscow",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

export default function BookingExtensionOffer({ bookingId, onComplete }: Props) {
  const [offer, setOffer] = useState<ExtensionOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"info" | "error" | "success">("info");

  const loadOffer = useCallback(async () => {
    try {
      const response = await fetch("/api/account/extension-offers", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Не удалось проверить предложение продления.");
      }
      const offers = Array.isArray(result.offers) ? result.offers : [];
      const current = offers.find(
        (item: ExtensionOffer) => item.booking_id === bookingId,
      ) as ExtensionOffer | undefined;
      setOffer(current ?? null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Ошибка проверки предложения.",
      );
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void loadOffer();
    const interval = window.setInterval(() => void loadOffer(), 15000);
    return () => window.clearInterval(interval);
  }, [loadOffer]);

  const acceptAndPay = async () => {
    if (!offer || busy) return;
    setBusy(true);
    setMessage("");
    setMessageType("info");

    try {
      const acceptResponse = await fetch("/api/account/extension-offers/accept", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation_id: offer.id }),
      });
      const accepted = await acceptResponse.json().catch(() => ({}));
      if (!acceptResponse.ok) {
        throw new Error(
          accepted.error || "Предложение больше недоступно. Обновите бронирования.",
        );
      }
      if (
        accepted.state !== "awaiting_payment" ||
        typeof accepted.payment_group_id !== "string"
      ) {
        throw new Error("Сервер не подтвердил создание резерва для продления.");
      }

      setMessage("Предложение принято. Подготавливаем защищённую оплату...");
      const paymentResponse = await fetch("/api/payments/create", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_group_id: accepted.payment_group_id }),
      });
      const payment = await paymentResponse.json().catch(() => ({}));

      if (!paymentResponse.ok) {
        throw new Error(
          payment.error ||
            "Не удалось начать оплату. Предложение можно проверить и повторить из личного кабинета.",
        );
      }

      if (payment.state === "succeeded") {
        setMessage("Оплата подтверждена. Бронирование обновляется...");
        setMessageType("success");
        await onComplete();
        await loadOffer();
        return;
      }

      if (
        payment.state === "pending" &&
        typeof payment.confirmation_url === "string" &&
        payment.confirmation_url.startsWith("https://")
      ) {
        window.location.assign(payment.confirmation_url);
        return;
      }

      throw new Error("Платёжный сервис не вернул подтверждённую ссылку на оплату.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось оформить продление.",
      );
      setMessageType("error");
      await loadOffer();
    } finally {
      setBusy(false);
    }
  };

  if (loading || !offer) return null;

  const isPaymentPending = offer.status === "awaiting_payment";

  return (
    <div className="mt-4 rounded-xl border border-[#A77BFF]/30 bg-[#8F5BFF]/[0.08] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#8F5BFF]/20 text-[#D6C5FF]">
          <Sparkles size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            {isPaymentPending ? "Продление ожидает оплаты" : "Продлите игру со скидкой"}
          </p>
          <p className="mt-1 text-xs leading-5 text-white/65">
            Следующий час на вашем столе свободен. Можно добавить ещё 60 минут
            — с {time(offer.source_end_at, offer.timezone)} до{" "}
            {time(offer.target_end_at, offer.timezone)}.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-white/10 bg-black/15 p-3">
        <div>
          {offer.discount_percent !== null && (
            <p className="text-xs font-semibold text-emerald-300">
              Скидка {offer.discount_percent}%
            </p>
          )}
          {offer.base_price_rub !== null && (
            <p className="mt-1 text-xs text-white/45 line-through">
              {money(offer.base_price_rub)}
            </p>
          )}
          <p className="text-xl font-semibold text-white">{money(offer.amount_rub)}</p>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-white/50">
          <Clock3 size={13} />
          До {time(offer.expires_at || offer.source_end_at, offer.timezone)}
        </p>
      </div>

      <button
        type="button"
        onClick={() => void acceptAndPay()}
        disabled={busy}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6B30CE] to-[#8F5BFF] px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-55"
      >
        {busy ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={16} />}
        {busy
          ? "Обрабатываем..."
          : isPaymentPending
            ? "Продолжить оплату"
            : "Продлить на 60 минут"}
      </button>

      {message && (
        <p
          role="status"
          className={`mt-3 flex items-start gap-2 text-xs leading-5 ${
            messageType === "error"
              ? "text-red-300"
              : messageType === "success"
                ? "text-emerald-300"
                : "text-[#D6C5FF]"
          }`}
        >
          {messageType === "error" && <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          {message}
        </p>
      )}
    </div>
  );
}
