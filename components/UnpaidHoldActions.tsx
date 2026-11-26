
"use client";

import { useEffect, useState } from "react";
import { Clock3, CreditCard, RefreshCw, X } from "lucide-react";

type Props = {
  bookingId: string;
  paymentGroupId: string;
  expiresAt: string;
  onComplete: () => void;
};

function formatRemaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export default function UnpaidHoldActions({
  bookingId,
  paymentGroupId,
  expiresAt,
  onComplete,
}: Props) {
  const [now, setNow] = useState(Date.now());
  const [working, setWorking] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState("");

  const expiresAtMs = Date.parse(expiresAt);
  const remaining = expiresAtMs - now;
  const active = Number.isFinite(expiresAtMs) && remaining > 0;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!active) {
      onComplete();
    }
  }, [active, onComplete]);

  const startPayment = async () => {
    if (working || !active) return;

    setWorking(true);
    setError("");

    try {
      const response = await fetch("/api/payments/create", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_group_id: paymentGroupId,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error || "Не удалось открыть страницу оплаты.",
        );
      }

      if (result.state === "succeeded") {
        window.location.assign(
          `/payment/return?payment_group_id=${encodeURIComponent(
            paymentGroupId,
          )}`,
        );
        return;
      }

      if (
        result.state !== "pending" ||
        typeof result.confirmation_url !== "string"
      ) {
        throw new Error(
          "Платёжный сервис не вернул ссылку для оплаты.",
        );
      }

      const paymentUrl = new URL(result.confirmation_url);

      if (paymentUrl.protocol !== "https:") {
        throw new Error("Получена небезопасная ссылка оплаты.");
      }

      window.location.assign(paymentUrl.toString());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось перейти к оплате.",
      );

      if (Date.now() >= expiresAtMs) {
        onComplete();
      }
    } finally {
      setWorking(false);
    }
  };

  const cancelHold = async () => {
    if (working || !active) return;

    setWorking(true);
    setError("");

    try {
      const response = await fetch(
        "/api/account/bookings/cancel",
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            booking_id: bookingId,
          }),
        },
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 409) {
          onComplete();
        }

        throw new Error(
          result.error || "Не удалось отменить временный резерв.",
        );
      }

      if (
        result.state !== "cancelled" &&
        result.state !== "completed"
      ) {
        throw new Error(
          "Сервер не подтвердил отмену временного резерва.",
        );
      }

      setConfirmCancel(false);
      onComplete();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Ошибка отмены временного резерва.",
      );
    } finally {
      setWorking(false);
    }
  };

  if (!active) {
    return null;
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
          <Clock3 size={16} />
          Временный резерв
        </div>

        <span className="font-mono text-sm font-semibold tabular-nums text-amber-200">
          {formatRemaining(remaining)}
        </span>
      </div>

      <p className="mt-2 text-xs leading-5 text-white/60">
        Слот зарезервирован на 5 минут. Завершите оплату до окончания
        времени резерва.
      </p>

      {!confirmCancel ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void startPayment()}
            disabled={working || !active}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6B30CE] to-[#8F5BFF] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {working ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <CreditCard size={15} />
            )}
            Перейти к оплате
          </button>

          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            disabled={working}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-400/30 px-4 text-sm text-red-200 hover:bg-red-400/10 disabled:opacity-50"
          >
            <X size={15} />
            Отменить резерв
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/[0.06] p-3">
          <p className="text-sm font-medium text-white">
            Отменить временный резерв?
          </p>
          <p className="mt-1 text-xs leading-5 text-white/60">
            Все неоплаченные слоты этой группы будут освобождены.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void cancelHold()}
              disabled={working}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-500 px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {working && (
                <RefreshCw size={13} className="animate-spin" />
              )}
              Подтвердить отмену
            </button>

            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              disabled={working}
              className="h-9 rounded-lg border border-white/10 px-3 text-xs text-white/70"
            >
              Назад
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs leading-5 text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
