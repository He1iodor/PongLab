"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  RefreshCw,
  XCircle,
} from "lucide-react";

type PaymentState =
  | "loading"
  | "pending"
  | "succeeded"
  | "cancelled"
  | "error";

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

export default function PaymentReturnClient({
  paymentGroupId,
}: {
  paymentGroupId: string;
}) {
  const [state, setState] = useState<PaymentState>("loading");
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  // Убираем технические параметры Vercel из адресной строки.
  // Bypass-cookie к этому моменту уже устанавливается Vercel.
  // Идентификатор бронирования оставляем.
  useEffect(() => {
    const url = new URL(window.location.href);

    const hadBypassParameters =
      url.searchParams.has("x-vercel-protection-bypass") ||
      url.searchParams.has("x-vercel-set-bypass-cookie");

    if (!hadBypassParameters) return;

    url.searchParams.delete("x-vercel-protection-bypass");
    url.searchParams.delete("x-vercel-set-bypass-cookie");

    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  const checkPayment = useCallback(
    async (manual = false) => {
      if (!paymentGroupId) {
        setState("error");
        setError("Не найден идентификатор бронирования.");
        return;
      }

      if (manual) setChecking(true);

      try {
        const params = new URLSearchParams({
          payment_group_id: paymentGroupId,
        });

        const response = await fetch(
          `/api/payments/status?${params.toString()}`,
          {
            cache: "no-store",
            credentials: "same-origin",
          },
        );

        const result = (
          await response.json().catch(() => ({}))
        ) as PaymentStatusResponse;

        if (!response.ok) {
          throw new Error(
            result.error || "Не удалось проверить оплату.",
          );
        }

        setAmount(
          typeof result.amount_rub === "number"
            ? result.amount_rub
            : null,
        );

        setError("");
        setState(result.state ?? "pending");
      } catch (caught) {
        setState("error");

        setError(
          caught instanceof Error
            ? caught.message
            : "Ошибка проверки оплаты.",
        );
      } finally {
        if (manual) setChecking(false);
      }
    },
    [paymentGroupId],
  );

  // Проверяем до получения окончательного статуса.
  // Если запрос временно не удался, повторяем его через 30 секунд.
  // Терминальные состояния succeeded и cancelled больше не опрашиваются.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;

      if (!paymentGroupId) {
        setState("error");
        setError("Не найден идентификатор бронирования.");
        return;
      }

      let nextDelay = 15_000;

      try {
        const params = new URLSearchParams({
          payment_group_id: paymentGroupId,
        });

        const response = await fetch(
          `/api/payments/status?${params.toString()}`,
          {
            cache: "no-store",
            credentials: "same-origin",
          },
        );

        const result = (
          await response.json().catch(() => ({}))
        ) as PaymentStatusResponse;

        if (!response.ok) {
          throw new Error(
            result.error || "Не удалось проверить оплату.",
          );
        }

        if (cancelled) return;

        setAmount(
          typeof result.amount_rub === "number"
            ? result.amount_rub
            : null,
        );

        setError("");

        const nextState = result.state ?? "pending";
        setState(nextState);

        if (
          nextState === "succeeded" ||
          nextState === "cancelled"
        ) {
          return;
        }
      } catch (caught) {
        if (cancelled) return;

        setState("error");
        setError(
          caught instanceof Error
            ? caught.message
            : "Не удалось связаться с сервером. Проверка будет повторена автоматически.",
        );

        nextDelay = 30_000;
      }

      if (!cancelled) {
        timer = setTimeout(poll, nextDelay);
      }
    };

    void poll();

    return () => {
      cancelled = true;

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [paymentGroupId]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090B18] px-4 py-10 text-white">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#111427] p-6 shadow-2xl sm:p-8">
        {state === "succeeded" ? (
          <>
            <CheckCircle2
              size={44}
              className="text-emerald-300"
            />

            <h1 className="mt-5 text-2xl font-semibold">
              Оплата прошла успешно
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              Бронирование подтверждено. Информация о нём
              появится в личном кабинете.
            </p>

            {amount !== null && (
              <p className="mt-4 text-lg font-semibold">
                {money(amount)}
              </p>
            )}
          </>
        ) : state === "cancelled" ? (
          <>
            <XCircle
              size={44}
              className="text-rose-300"
            />

            <h1 className="mt-5 text-2xl font-semibold">
              Платёж не завершён
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              YooKassa сообщила об окончательной отмене платежа.
              Эта бронь закрыта. Для новой попытки выберите свободное
              время и создайте новое бронирование.
            </p>
          </>
        ) : state === "pending" || state === "loading" ? (
          <>
            <Clock3
              size={44}
              className="text-[#A77BFF]"
            />

            <h1 className="mt-5 text-2xl font-semibold">
              Проверяем оплату
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              Платёж ещё обрабатывается или уведомление от платёжного
              сервиса не поступило. Страница будет автоматически
              проверять статус каждые 15 секунд. Не оплачивайте
              бронирование повторно.
            </p>

            {amount !== null && (
              <p className="mt-4 text-lg font-semibold">
                {money(amount)}
              </p>
            )}
          </>
        ) : (
          <>
            <XCircle
              size={44}
              className="text-amber-300"
            />

            <h1 className="mt-5 text-2xl font-semibold">
              Не удалось проверить оплату
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              {error}
            </p>

            <p className="mt-2 text-xs leading-5 text-white/45">
              Автоматическая проверка будет повторена. Не создавайте
              новый платёж, пока не выяснено состояние текущего.
            </p>
          </>
        )}

        {(state === "pending" || state === "error") && (
          <button
            type="button"
            onClick={() => void checkPayment(true)}
            disabled={checking}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-sm font-medium transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={checking ? "animate-spin" : ""}
            />
            Проверить сейчас
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
