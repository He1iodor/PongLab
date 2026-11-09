"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, RefreshCw, XCircle } from "lucide-react";

type PaymentState = "loading" | "pending" | "succeeded" | "cancelled" | "error";

type PaymentStatusResponse = {
  state?: "pending" | "succeeded" | "cancelled";
  error?: string;
  amount_rub?: number;
  booking_count?: number;
};

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function PaymentReturnClient({ paymentGroupId }: { paymentGroupId: string }) {
  const [state, setState] = useState<PaymentState>("loading");
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const checkPayment = useCallback(async (manual = false) => {
    if (!paymentGroupId) {
      setState("error");
      setError("Не найден идентификатор бронирования.");
      return;
    }

    if (manual) setChecking(true);

    try {
      const params = new URLSearchParams({ payment_group_id: paymentGroupId });
      const response = await fetch(`/api/payments/status?${params.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = (await response.json().catch(() => ({}))) as PaymentStatusResponse;

      if (!response.ok) {
        throw new Error(result.error || "Не удалось проверить оплату.");
      }

      setAmount(typeof result.amount_rub === "number" ? result.amount_rub : null);
      setError("");
      setState(result.state ?? "pending");
    } catch (caught) {
      setState("error");
      setError(caught instanceof Error ? caught.message : "Ошибка проверки оплаты.");
    } finally {
      if (manual) setChecking(false);
    }
  }, [paymentGroupId]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled || attempts >= 20) return;
      attempts += 1;

      try {
        const params = new URLSearchParams({ payment_group_id: paymentGroupId });
        const response = await fetch(`/api/payments/status?${params.toString()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const result = (await response.json().catch(() => ({}))) as PaymentStatusResponse;

        if (!response.ok) {
          if (!cancelled) {
            setState("error");
            setError(result.error || "Не удалось проверить оплату.");
          }
          return;
        }

        if (cancelled) return;
        setAmount(typeof result.amount_rub === "number" ? result.amount_rub : null);
        setError("");
        setState(result.state ?? "pending");

        if (result.state === "pending" && attempts < 20) {
          window.setTimeout(poll, 3000);
        }
      } catch {
        if (!cancelled) {
          setState("error");
          setError("Не удалось связаться с сервером. Проверьте статус повторно.");
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [paymentGroupId]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090B18] px-4 py-10 text-white">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#111427] p-6 shadow-2xl sm:p-8">
        {state === "succeeded" ? (
          <>
            <CheckCircle2 size={44} className="text-emerald-300" />
            <h1 className="mt-5 text-2xl font-semibold">Оплата прошла успешно</h1>
            <p className="mt-3 text-sm leading-6 text-white/65">
              Бронирование подтверждено. Информация о нём появится в личном кабинете.
            </p>
            {amount !== null && <p className="mt-4 text-lg font-semibold">{money(amount)}</p>}
          </>
        ) : state === "cancelled" ? (
          <>
            <XCircle size={44} className="text-rose-300" />
            <h1 className="mt-5 text-2xl font-semibold">Платёж не завершён</h1>
            <p className="mt-3 text-sm leading-6 text-white/65">
              YooKassa сообщила об отмене платежа. Проверьте бронирование в личном кабинете и при необходимости выберите новое время.
            </p>
          </>
        ) : state === "pending" || state === "loading" ? (
          <>
            <Clock3 size={44} className="text-[#A77BFF]" />
            <h1 className="mt-5 text-2xl font-semibold">Проверяем оплату</h1>
            <p className="mt-3 text-sm leading-6 text-white/65">
              Платёж ещё обрабатывается или уведомление от банка не поступило. Не оплачивайте бронирование повторно. Страница автоматически проверит статус ещё несколько раз.
            </p>
            {amount !== null && <p className="mt-4 text-lg font-semibold">{money(amount)}</p>}
          </>
        ) : (
          <>
            <XCircle size={44} className="text-amber-300" />
            <h1 className="mt-5 text-2xl font-semibold">Не удалось проверить оплату</h1>
            <p className="mt-3 text-sm leading-6 text-white/65">{error}</p>
          </>
        )}

        {(state === "pending" || state === "error") && (
          <button
            type="button"
            onClick={() => void checkPayment(true)}
            disabled={checking}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-sm font-medium transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            <RefreshCw size={16} className={checking ? "animate-spin" : ""} />
            Проверить ещё раз
          </button>
        )}

        <Link
          href="/"
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#8F5BFF] px-4 text-sm font-semibold text-white transition hover:bg-[#A77BFF]"
        >
          На главную
        </Link>
      </section>
    </main>
  );
}
