"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock3,
  MapPin,
  RefreshCw,
  Table2,
} from "lucide-react";

export type AccountBooking = {
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
  created_at: string;
  table_id: string;
  table_name: string;
  studio_id: string | null;
  studio_name: string;
  studio_address: string | null;
  timezone: string;
};

type MyBookingsPanelProps = {
  onCreateBooking: () => void;
};

type CancellationDetails = {
  reason: string | null;
  party: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      weekday: "short",
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone || "Europe/Moscow",
    }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  }
}

function isPaymentInProgress(booking: AccountBooking) {
  return (
    booking.status === "pending_payment" &&
    booking.payment_status === "pending" &&
    Boolean(
      booking.payment_init_started_at || booking.payment_id,
    ) &&
    Boolean(booking.payment_group_id)
  );
}

function parseCancellationDetails(
  value: string | null | undefined,
): CancellationDetails | null {
  if (!value) return null;

  const structuredMatch = value.match(
    /^yookassa_canceled\|reason=([a-z0-9_-]+)\|party=([a-z0-9_-]+)$/i,
  );

  if (structuredMatch) {
    return {
      reason: structuredMatch[1].toLowerCase(),
      party: structuredMatch[2].toLowerCase(),
    };
  }

  // Старые записи сохраняли только reason, например general_decline.
  const legacyCode = value.trim().toLowerCase();

  if (/^[a-z0-9_-]{1,80}$/.test(legacyCode)) {
    return {
      reason: legacyCode,
      party: null,
    };
  }

  return null;
}

function cancellationReasonText(reason: string | null): string {
  if (!reason) {
    return "Платёжный сервис не предоставил подробную причину отмены.";
  }

  const messages: Record<string, string> = {
    "3d_secure_failed":
      "Не пройдена проверка 3-D Secure. Попробуйте оплатить ещё раз и завершить подтверждение в приложении банка.",
    call_issuer:
      "Платёж отклонён без подробного объяснения. Для уточнения обратитесь в банк или организацию, выпустившую средство оплаты.",
    card_expired:
      "Истёк срок действия карты. Для новой попытки используйте другую карту.",
    country_forbidden:
      "Оплата картой, выпущенной в этой стране, не разрешена. Используйте другой способ оплаты.",
    expired_on_confirmation:
      "Истекло время, отведённое на завершение оплаты. Для новой попытки нужно создать новый платёж.",
    fraud_suspected:
      "Платёж заблокирован системой безопасности. Для уточнения обратитесь к инициатору отмены.",
    general_decline:
      "Причина не детализирована платёжным сервисом. Инициатор отмены указан отдельно, если он известен.",
    identification_required:
      "Для этого кошелька требуется идентификация. Используйте другой способ оплаты или завершите идентификацию кошелька.",
    insufficient_funds:
      "Недостаточно средств для оплаты. Пополните счёт или используйте другое средство оплаты.",
    internal_timeout:
      "Произошёл технический сбой при обработке платежа. Можно повторить оплату, создав новое бронирование.",
    invalid_card_number:
      "Номер карты указан некорректно. Проверьте реквизиты или используйте другую карту.",
    invalid_csc:
      "Код безопасности карты указан некорректно. Проверьте реквизиты карты.",
    issuer_unavailable:
      "Банк или организация, выпустившая средство оплаты, временно недоступна. Повторите попытку позже или выберите другой способ оплаты.",
    loan_declined:
      "Заявка на кредит или рассрочку отклонена. Выберите другой способ оплаты.",
    payment_method_limit_exceeded:
      "Достигнут лимит для этого средства оплаты или магазина. Используйте другой способ или повторите попытку позже.",
    payment_method_restricted:
      "Операции этим средством оплаты ограничены. Обратитесь к его эмитенту или используйте другое средство оплаты.",
    unsupported_mobile_operator:
      "Оплата с номера этого мобильного оператора не поддерживается. Используйте другой способ оплаты.",
  };

  return (
    messages[reason] ??
    "Платёжный сервис отменил операцию. Для уточнения используйте поддержку указанного инициатора."
  );
}

function cancellationPartyText(party: string | null): string | null {
  if (!party) return null;

  const parties: Record<string, string> = {
    merchant: "Продавец — PongLab",
    yoo_money: "ЮKassa",
    payment_network:
      "Банк-эмитент или другой участник платёжной сети",
  };

  return parties[party] ?? "Неизвестный участник платёжной цепочки";
}

function getStatus(booking: AccountBooking, now: number) {
  const paymentInProgress = isPaymentInProgress(booking);

  const holdExpired =
    !paymentInProgress &&
    (
      booking.effective_status === "expired" ||
      (
        booking.status === "pending_payment" &&
        Boolean(booking.hold_expires_at) &&
        Date.parse(booking.hold_expires_at as string) <= now
      )
    );

  if (paymentInProgress) {
    return {
      label: "Оплата проверяется",
      className:
        "border-amber-300/25 bg-amber-300/10 text-amber-100",
    };
  }

  if (holdExpired) {
    return {
      label: "Временный резерв истёк",
      className: "border-white/10 bg-white/5 text-white/50",
    };
  }

  if (
    booking.status === "cancelled" &&
    booking.payment_status === "cancelled"
  ) {
    return {
      label: "Платёж отменён",
      className: "border-red-300/25 bg-red-300/10 text-red-200",
    };
  }

  if (
    booking.status === "cancelled" &&
    booking.payment_status === "failed"
  ) {
    return {
      label: "Оплата не прошла",
      className: "border-red-300/25 bg-red-300/10 text-red-200",
    };
  }

  if (booking.status === "cancelled") {
    return {
      label: "Отменена",
      className: "border-white/10 bg-white/5 text-white/55",
    };
  }

  if (booking.status === "completed") {
    return {
      label: "Завершена",
      className: "border-white/10 bg-white/5 text-white/55",
    };
  }

  if (booking.status === "expired") {
    return {
      label: "Резерв истёк",
      className: "border-white/10 bg-white/5 text-white/50",
    };
  }

  if (
    booking.status === "confirmed" &&
    booking.payment_status === "succeeded"
  ) {
    return {
      label: "Оплачена и подтверждена",
      className:
        "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    };
  }

  if (booking.status === "pending_payment") {
    return {
      label: "Временный резерв · ожидает оплаты",
      className:
        "border-amber-300/25 bg-amber-300/10 text-amber-100",
    };
  }

  if (
    booking.payment_status === "failed" ||
    booking.payment_status === "cancelled"
  ) {
    return {
      label: "Платёж не завершён",
      className: "border-red-300/25 bg-red-300/10 text-red-200",
    };
  }

  return {
    label: "Статус: " + booking.status,
    className: "border-white/10 bg-white/5 text-white/65",
  };
}

function formatDeadline(
  value: string | null | undefined,
  timeZone: string | null | undefined,
): string {
  if (!value) {
    return "не указано";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "не указано";
  }

  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: timeZone || "Europe/Moscow",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
}

export default function MyBookingsPanel({
  onCreateBooking,
}: MyBookingsPanelProps) {
  const [bookings, setBookings] = useState<AccountBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());

  const loadBookings = useCallback(async (manual = false) => {
    if (manual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const response = await fetch("/api/account/bookings", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Не удалось загрузить ваши бронирования.",
        );
      }

      setBookings(
        Array.isArray(result.bookings) ? result.bookings : [],
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось загрузить бронирования. Попробуйте ещё раз.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  // Пока в кабинете открыта страница с незавершённой оплатой,
  // проверяем её через существующий защищённый API каждые 30 секунд.
  // При возвращении пользователя во вкладку проверка запускается сразу.
  const pendingPaymentGroupIds = useMemo(
    () =>
      [
        ...new Set(
          bookings
            .filter(isPaymentInProgress)
            .map((booking) => booking.payment_group_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ].slice(0, 5),
    [bookings],
  );

  useEffect(() => {
    if (pendingPaymentGroupIds.length === 0) return;

    let stopped = false;
    let checkingPayments = false;
    let batchCursor = 0;

    const checkPendingPayments = async () => {
      if (stopped || checkingPayments) return;

      checkingPayments = true;

      const batchSize = Math.min(5, pendingPaymentGroupIds.length);
      const paymentGroupsToCheck = Array.from(
        { length: batchSize },
        (_, index) =>
          pendingPaymentGroupIds[
            (batchCursor + index) % pendingPaymentGroupIds.length
          ],
      );
      batchCursor =
        (batchCursor + batchSize) % pendingPaymentGroupIds.length;

      try {
        const results = await Promise.all(
          paymentGroupsToCheck.map(async (paymentGroupId) => {
            try {
              const params = new URLSearchParams({
                payment_group_id: paymentGroupId,
              });

              const response = await fetch(
                `/api/payments/status?${params.toString()}`,
                {
                  method: "GET",
                  credentials: "same-origin",
                  cache: "no-store",
                },
              );

              if (!response.ok) return false;

              const result = await response.json().catch(() => ({}));

              return (
                result.state === "succeeded" ||
                result.state === "cancelled"
              );
            } catch {
              // Временная ошибка сети не меняет статус оплаты.
              // Следующая проверка будет выполнена по расписанию.
              return false;
            }
          }),
        );

        if (!stopped && results.some(Boolean)) {
          await loadBookings(true);
        }
      } finally {
        checkingPayments = false;
      }
    };

    void checkPendingPayments();

    const interval = window.setInterval(() => {
      void checkPendingPayments();
    }, 30_000);

    const handleFocus = () => {
      void checkPendingPayments();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkPendingPayments();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [pendingPaymentGroupIds, loadBookings]);

  // Обновляем отображаемый статус резерва, пока окно открыто.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);

    return () => window.clearInterval(timer);
  }, []);

  const sortedBookings = [...bookings].sort((a, b) => {
    const aStart = Date.parse(a.start_at);
    const bStart = Date.parse(b.start_at);
    const aUpcoming = aStart >= now;
    const bUpcoming = bStart >= now;

    if (aUpcoming && !bUpcoming) return -1;
    if (!aUpcoming && bUpcoming) return 1;

    return aUpcoming
      ? aStart - bStart
      : bStart - aStart;
  });

  return (
    <section className="w-full min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-6 text-white/55">
          Здесь отображаются брони, сохранённые в вашем аккаунте.
        </p>

        <button
          type="button"
          onClick={() => void loadBookings(true)}
          disabled={loading || refreshing}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white/75 transition hover:bg-white/[0.08] disabled:opacity-50"
        >
          <RefreshCw
            size={15}
            className={
              loading || refreshing ? "animate-spin" : ""
            }
          />
          Обновить
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-400/30 bg-red-400/10 p-4"
        >
          <p className="text-sm leading-6 text-red-200">
            {error}
          </p>

          <button
            type="button"
            onClick={() => void loadBookings(true)}
            className="mt-3 text-sm font-semibold text-white underline underline-offset-4"
          >
            Повторить
          </button>
        </div>
      )}

      {loading ? (
        <div
          role="status"
          className="flex items-center gap-3 py-8 text-sm text-white/60"
        >
          <RefreshCw
            size={18}
            className="animate-spin text-[#A77BFF]"
          />
          Загружаем ваши бронирования...
        </div>
      ) : sortedBookings.length === 0 && !error ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 text-center">
          <CalendarDays
            size={28}
            className="mx-auto text-[#A77BFF]"
          />

          <h3 className="mt-3 font-semibold text-white">
            Пока нет бронирований
          </h3>

          <p className="mt-2 text-sm leading-6 text-white/55">
            Выберите время в календаре. Созданные временные резервы
            и будущие подтверждённые брони появятся здесь.
          </p>

          <button
            type="button"
            onClick={onCreateBooking}
            className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-[#6B30CE] to-[#8F5BFF] px-5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Создать бронь
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedBookings.map((booking) => {
            const status = getStatus(booking, now);
            const paymentInProgress =
              isPaymentInProgress(booking);

            const isTemporary =
              !paymentInProgress &&
              booking.status === "pending_payment" &&
              Boolean(booking.hold_expires_at) &&
              Date.parse(booking.hold_expires_at as string) > now;

            const paymentReturnUrl = booking.payment_group_id
              ? `/payment/return?payment_group_id=${encodeURIComponent(
                  booking.payment_group_id,
                )}`
              : null;

            const cancellation =
              parseCancellationDetails(
                booking.payment_failure_reason,
              );

            const isPaymentCancelled =
              booking.status === "cancelled" &&
              (
                booking.payment_status === "cancelled" ||
                booking.payment_status === "failed"
              );

            return (
              <article
                key={booking.id}
                className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 font-semibold text-white">
                      <CalendarDays
                        size={17}
                        className="shrink-0 text-[#A77BFF]"
                      />
                      {formatDateTime(
                        booking.start_at,
                        booking.timezone,
                      )}
                    </h3>

                    <p className="mt-2 flex items-start gap-2 text-sm leading-5 text-white/60">
                      <Clock3
                        size={15}
                        className="mt-0.5 shrink-0"
                      />
                      До{" "}
                      {new Intl.DateTimeFormat("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone:
                          booking.timezone || "Europe/Moscow",
                      }).format(new Date(booking.end_at))}
                    </p>
                  </div>

                  <span
                    className={`inline-flex max-w-full rounded-full border px-3 py-1.5 text-xs ${status.className}`}
                  >
                    {status.label}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
                  <div className="flex items-start gap-2">
                    <MapPin
                      size={16}
                      className="mt-0.5 shrink-0 text-white/40"
                    />

                    <div className="min-w-0">
                      <p className="text-xs text-white/45">
                        Клуб
                      </p>
                      <p className="mt-1 text-sm text-white/80">
                        {booking.studio_name}
                      </p>

                      {booking.studio_address && (
                        <p className="mt-1 break-words text-xs leading-5 text-white/45">
                          {booking.studio_address}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Table2
                      size={16}
                      className="mt-0.5 shrink-0 text-white/40"
                    />

                    <div>
                      <p className="text-xs text-white/45">
                        Стол
                      </p>
                      <p className="mt-1 text-sm text-white/80">
                        {booking.table_name}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <span className="text-sm text-white/55">
                    Стоимость
                  </span>

                  <span className="text-lg font-semibold text-white">
                    {money(booking.price_rub)}
                  </span>
                </div>

                {paymentInProgress && (
                  <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3">
                    <p className="text-xs leading-5 text-amber-100/85">
                      Платёж уже инициирован. Система автоматически
                      проверяет его каждые 30 секунд, пока этот раздел
                      личного кабинета открыт. Не создавайте повторную
                      бронь и не оплачивайте её повторно до получения
                      окончательного статуса.
                    </p>

                    {paymentReturnUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          window.location.assign(paymentReturnUrl)
                        }
                        className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg border border-amber-200/20 bg-amber-200/10 px-4 text-xs font-semibold text-amber-50 transition hover:bg-amber-200/15"
                      >
                        Открыть страницу проверки
                      </button>
                    )}
                  </div>
                )}

                {isPaymentCancelled && (
                  <div className="mt-3 rounded-xl border border-red-300/20 bg-red-300/[0.06] p-3">
                    <p className="text-sm font-semibold text-red-100">
                      Предыдущая оплата окончательно отменена.
                    </p>

                    <p className="mt-2 text-xs leading-5 text-red-100/80">
                      {cancellationReasonText(
                        cancellation?.reason ?? null,
                      )}
                    </p>

                    {cancellationPartyText(
                      cancellation?.party ?? null,
                    ) && (
                      <p className="mt-2 text-xs leading-5 text-white/60">
                        Инициатор:{" "}
                        {cancellationPartyText(
                          cancellation?.party ?? null,
                        )}
                        .
                      </p>
                    )}

                    <p className="mt-2 text-xs leading-5 text-white/55">
                      Эта бронь закрыта. Для новой попытки выберите
                      свободное время и создайте новое бронирование.
                      Старый платёж повторно не запускается.
                    </p>

                    <button
                      type="button"
                      onClick={onCreateBooking}
                      className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-[#8F5BFF] px-4 text-xs font-semibold text-white transition hover:bg-[#A77BFF]"
                    >
                      Выбрать время заново
                    </button>
                  </div>
                )}

                {isTemporary && booking.hold_expires_at && (
                  <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100/80">
                    Временный резерв действует до{" "}
                    {formatDeadline(
                      booking.hold_expires_at,
                      booking.timezone,
                    )}.
                    Оплата не выполнена; этот статус не даёт права
                    доступа в студию.
                  </p>
                )}

                {booking.status === "confirmed" &&
                  booking.payment_status === "succeeded" && (
                    <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs leading-5 text-white/50">
                      Бронь подтверждена. Управление дверью появится
                      после подключения контроллера доступа; эта
                      страница пока не отправляет команды замку.
                    </p>
                  )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
