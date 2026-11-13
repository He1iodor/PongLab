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
  | "refunded"
  | "refund_required"
  | "error";

type PaymentStatusResponse = {
  state?: "pending" | "succeeded" | "cancelled" | "refunded";
  error?: string;
  amount_rub?: number;
  booking_count?: number;
  monitor_late_payment?: boolean;
  refund_required?: boolean;
};

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function resolvedState(result: PaymentStatusResponse): PaymentState {
  if (result.refund_required) return "refund_required";
  return result.state ?? "pending";
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
  const [monitoringLatePayment, setMonitoringLatePayment] = useState(false);

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
        setMonitoringLatePayment(
          Boolean(result.monitor_late_payment),
        );
        setError("");
        setState(resolvedState(result));
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

  // Обычная оплата проверяется чаще. После локального тайм-аута резерв уже
  // закрыт, но страница продолжает проверять возможное позднее списание.
  // После успешного/окончательного статуса YooKassa опрос прекращается.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (stopped) return;

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

        if (stopped) return;

        setAmount(
          typeof result.amount_rub === "number"
            ? result.amount_rub
            : null,
        );

        const monitoring = Boolean(result.monitor_late_payment);
        const nextState = resolvedState(result);

        setMonitoringLatePayment(monitoring);
        setError("");
        setState(nextState);

        if (
          nextState === "succeeded" ||
          nextState === "refunded" ||
          nextState === "refund_required" ||
          (nextState === "cancelled" && !monitoring)
        ) {
          return;
        }

        if (monitoring) {
          nextDelay = 30_000;
        }
      } catch (caught) {
        if (stopped) return;

        setState("error");
        setError(
          caught instanceof Error
            ? caught.message
            : "Не удалось связаться с сервером. Проверка будет повторена автоматически.",
        );

        nextDelay = 30_000;
      }

      if (!stopped) {
        timer = setTimeout(poll, nextDelay);
      }
    };

    void poll();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [paymentGroupId]);

  const showManualCheck =
    state === "pending" ||
    state === "error" ||
    (state === "cancelled" && monitoringLatePayment);

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
        ) : state === "refunded" ? (
          <>
            <CheckCircle2
              size={44}
              className="text-emerald-300"
            />

            <h1 className="mt-5 text-2xl font-semibold">
              Возврат оформлен
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              Возврат подтверждён PongLab. Срок поступления средств
              на счёт зависит от банка и платёжной системы.
            </p>

            {amount !== null && (
              <p className="mt-4 text-lg font-semibold">
                {money(amount)}
              </p>
            )}
          </>
        ) : state === "refund_required" ? (
          <>
            <XCircle
              size={44}
              className="text-amber-300"
            />

            <h1 className="mt-5 text-2xl font-semibold">
              Нужна проверка возврата
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              Платёж подтвердился уже после закрытия временного резерва.
              Бронь не восстановлена, чтобы не занять время, которое
              могло быть выбрано другим клиентом. Свяжитесь с
              администрацией PongLab: мы сверим операцию и оформим
              возврат.
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
              {monitoringLatePayment
                ? "Резерв закрыт — проверяем платёж"
                : "Платёж не завершён"}
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              {monitoringLatePayment
                ? "Подтверждение не поступило в отведённые 10 минут, поэтому резерв закрыт. Мы продолжаем проверять статус у YooKassa на случай задержки. Не оплачивайте бронирование повторно."
                : "Оплата не была подтверждена в течение 10 минут или YooKassa отклонила операцию. Резерв закрыт. Если деньги всё же списались, не создавайте повторную оплату — свяжитесь с администрацией PongLab, мы проверим операцию и при необходимости оформим возврат."}
            </p>

            {amount !== null && (
              <p className="mt-4 text-lg font-semibold">
                {money(amount)}
              </p>
            )}
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
              сервиса не поступило. Проверяем статус автоматически.
              Не оплачивайте бронирование повторно.
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

        {showManualCheck && (
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
