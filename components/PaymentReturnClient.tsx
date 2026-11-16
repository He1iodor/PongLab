
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  RefreshCw,
  XCircle,
  AlertTriangle,
} from "lucide-react";

type PaymentState =
  | "loading"
  | "pending"
  | "succeeded"
  | "cancelled"
  | "refunded"
  | "refund_required"
  | "transfer_completed"
  | "transfer_pending"
  | "transfer_cancelled"
  | "transfer_refund_required"
  | "transfer_refunded"
  | "transfer_monitoring"
  | "transfer_review"
  | "review_required"
  | "late_refund_pending"
  | "late_refunded"
  | "late_refund_review"
  | "error";

type PaymentStatusResponse = {
  state?: PaymentState;
  error?: string;
  amount_rub?: number;
  booking_count?: number;
  monitor_late_payment?: boolean;
  refund_required?: boolean;
  confirmation_missing?: boolean;
  purpose?: "booking" | "transfer_adjustment";
  transfer_status?: string | null;
  transfer_completed_at?: string | null;
  transfer_manual_resolution_required?: boolean;
};

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function resolvedState(
  result: PaymentStatusResponse,
): PaymentState {
  if (
    result.state === "late_refunded" ||
    result.state?.startsWith("late_refund_")
  ) {
    return result.state;
  }

  if (result.state?.startsWith("transfer_")) {
    return result.state;
  }

  if (result.refund_required) {
    return "refund_required";
  }

  if (result.confirmation_missing) {
    return "review_required";
  }

  return result.state ?? "pending";
}

function isTerminalState(state: PaymentState) {
  return [
    "succeeded",
    "refunded",
    "refund_required",
    "cancelled",
    "transfer_completed",
    "transfer_cancelled",
    "transfer_refund_required",
    "transfer_refunded",
    "transfer_review",
    "review_required",
    "late_refunded",
    "late_refund_review",
  ].includes(state);
}

export default function PaymentReturnClient({
  paymentGroupId,
}: {
  paymentGroupId: string;
}) {
  const [state, setState] =
    useState<PaymentState>("loading");
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [monitoringLatePayment, setMonitoringLatePayment] =
    useState(false);
  const [manualResolutionRequired, setManualResolutionRequired] =
    useState(false);

  // Убираем технические параметры Vercel из адресной строки.
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

  const applyResult = useCallback(
    (result: PaymentStatusResponse) => {
      setAmount(
        typeof result.amount_rub === "number"
          ? result.amount_rub
          : null,
      );

      setMonitoringLatePayment(
        Boolean(result.monitor_late_payment),
      );

      setManualResolutionRequired(
        Boolean(result.transfer_manual_resolution_required),
      );

      setError("");
      setState(resolvedState(result));
    },
    [],
  );

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

        applyResult(result);
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
    [paymentGroupId, applyResult],
  );

  // Опрос продолжается для pending, transfer_monitoring
  // и late_refund_pending.
  // После подтверждённого или окончательного статуса прекращается.
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

        applyResult(result);

        const nextState = resolvedState(result);

        if (isTerminalState(nextState)) {
          return;
        }

        if (
          nextState === "transfer_monitoring" ||
          result.monitor_late_payment
        ) {
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
  }, [paymentGroupId, applyResult]);

  const showManualCheck =
    state === "pending" ||
    state === "error" ||
    (state === "cancelled" && monitoringLatePayment) ||
    state === "transfer_pending" ||
    state === "transfer_monitoring" ||
    state === "late_refund_pending";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090B18] px-4 py-10 text-white">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#111427] p-6 shadow-2xl sm:p-8">
        {state === "late_refund_pending" ? (
          <>
            <Clock3 size={44} className="text-amber-300" />

            <h1 className="mt-5 text-2xl font-semibold">
              Возврат обрабатывается
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              YooKassa подтвердила позднюю оплату после закрытия резерва.
              Бронирование не восстановлено. Мы отправили полный возврат
              и проверяем его подтверждение. Не создавайте новую оплату.
            </p>

            {amount !== null && (
              <p className="mt-4 text-lg font-semibold">
                {money(amount)}
              </p>
            )}
          </>
        ) : state === "late_refunded" ? (
          <>
            <CheckCircle2 size={44} className="text-emerald-300" />

            <h1 className="mt-5 text-2xl font-semibold">
              Оплата возвращена
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              YooKassa подтвердила полный возврат поздней оплаты.
              Бронирование не восстановлено. Срок поступления средств
              на счёт зависит от банка.
            </p>

            {amount !== null && (
              <p className="mt-4 text-lg font-semibold">
                {money(amount)}
              </p>
            )}
          </>
        ) : state === "late_refund_review" ? (
          <>
            <AlertTriangle size={44} className="text-amber-300" />

            <h1 className="mt-5 text-2xl font-semibold">
              Возврат требует проверки
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              YooKassa подтвердила позднюю оплату, но автоматический возврат
              не завершён. Бронирование не восстановлено. Не оплачивайте
              повторно и обратитесь к администрации PongLab для проверки.
            </p>

            {amount !== null && (
              <p className="mt-4 text-lg font-semibold">
                {money(amount)}
              </p>
            )}
          </>
        ) : state === "transfer_completed" ? (
          <>
            <CheckCircle2
              size={44}
              className="text-emerald-300"
            />

            <h1 className="mt-5 text-2xl font-semibold">
              Перенос выполнен
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              Доплата подтверждена. Перенос бронирования завершён.
              Новые клуб, дата и время доступны в личном кабинете.
            </p>

            {amount !== null && (
              <p className="mt-4 text-lg font-semibold">
                {money(amount)}
              </p>
            )}
          </>
        ) : state === "transfer_pending" ? (
          <>
            <Clock3
              size={44}
              className="text-[#A77BFF]"
            />

            <h1 className="mt-5 text-2xl font-semibold">
              Ожидаем доплату за перенос
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              YooKassa ещё обрабатывает платёж. Исходное бронирование
              остаётся активным до подтверждения доплаты.
              Проверяем статус автоматически. Не оплачивайте повторно.
            </p>

            {amount !== null && (
              <p className="mt-4 text-lg font-semibold">
                {money(amount)}
              </p>
            )}
          </>
        ) : state === "transfer_monitoring" ? (
          <>
            <Clock3
              size={44}
              className="text-amber-300"
            />

            <h1 className="mt-5 text-2xl font-semibold">
              Проверяем платёж за перенос
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              Время ожидания подтверждения истекло, поэтому перенос
              пока не выполнен. Мы продолжаем проверять YooKassa
              на случай задержки ответа. Исходная бронь остаётся
              без изменений. Не создавайте повторную оплату.
            </p>

            {amount !== null && (
              <p className="mt-4 text-lg font-semibold">
                {money(amount)}
              </p>
            )}
          </>
        ) : state === "transfer_cancelled" ? (
          <>
            <XCircle
              size={44}
              className="text-rose-300"
            />

            <h1 className="mt-5 text-2xl font-semibold">
              Доплата не прошла
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              Перенос не выполнен. Исходное бронирование сохранено
              без изменений. Если условия переноса ещё соблюдаются,
              можно начать новую операцию из личного кабинета.
            </p>

            {amount !== null && (
              <p className="mt-4 text-lg font-semibold">
                {money(amount)}
              </p>
            )}
          </>
        ) : state === "transfer_refund_required" ? (
          <>
            <AlertTriangle
              size={44}
              className="text-amber-300"
            />

            <h1 className="mt-5 text-2xl font-semibold">
              Требуется возврат доплаты
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              YooKassa подтвердила платёж после закрытия резерва
              для переноса. Перенос не выполнен, исходная бронь
              сохранена. Не создавайте повторную оплату или перенос.
              Обратитесь к администрации PongLab для сверки и возврата.
            </p>

            {amount !== null && (
              <p className="mt-4 text-lg font-semibold">
                {money(amount)}
              </p>
            )}
          </>
        ) : state === "transfer_refunded" ? (
          <>
            <CheckCircle2
              size={44}
              className="text-emerald-300"
            />

            <h1 className="mt-5 text-2xl font-semibold">
              Доплата возвращена
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              Возврат доплаты за перенос подтверждён.
              Исходное бронирование не изменено.
              Срок поступления средств зависит от банка.
            </p>

            {amount !== null && (
              <p className="mt-4 text-lg font-semibold">
                {money(amount)}
              </p>
            )}
          </>
        ) : state === "transfer_review" ? (
          <>
            <AlertTriangle
              size={44}
              className="text-amber-300"
            />

            <h1 className="mt-5 text-2xl font-semibold">
              Перенос требует проверки
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              Платёжная группа и операция переноса находятся
              в несогласованном состоянии. Мы не можем подтвердить
              завершение переноса автоматически.
              Не создавайте новую оплату или перенос.
              Обратитесь к администрации PongLab.
            </p>

            {manualResolutionRequired && (
              <p className="mt-3 text-xs leading-5 text-amber-200">
                Для операции установлена необходимость ручного разрешения.
              </p>
            )}

            {amount !== null && (
              <p className="mt-4 text-lg font-semibold">
                {money(amount)}
              </p>
            )}
          </>
        ) : state === "succeeded" ? (
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
        ) : state === "review_required" ? (
          <>
            <AlertTriangle
              size={44}
              className="text-amber-300"
            />

            <h1 className="mt-5 text-2xl font-semibold">
              Требуется проверка бронирования
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/65">
              Платёж отмечен как успешный, но система не подтвердила
              активное бронирование. Не создавайте новую оплату.
              Обратитесь к администрации PongLab для сверки операции.
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
                : "Оплата не была подтверждена в течение 10 минут или YooKassa отклонила операцию. Резерв закрыт. Если деньги всё же списались, не создавайте повторную оплату — свяжитесь с администрацией PongLab."}
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
              Автоматическая проверка будет повторена.
              Не создавайте новый платёж, пока не выяснено
              состояние текущего.
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
