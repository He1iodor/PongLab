
"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import BookingTransferAction from "@/components/BookingTransferAction";

type Props = {
  bookingId: string;
  startAt: string;
  studioId: string | null;
  timezone: string;
  sourcePrice: number;
  now: number;

  transferUsed: boolean;
  transferBlocked: boolean;
  transferOperationId: string | null;
  transferStatus: string | null;
  transferDeadlineAt: string | null;
  transferAdjustmentPaymentGroupId: string | null;
  transferRefundStatus: string | null;
  transferManualResolutionRequired: boolean;
  latePaymentRefundActive: boolean;

  onComplete: () => void;
};

type CancellationState =
  | "confirm"
  | "processing"
  | "completed"
  | "error"
  | null;

export default function BookingManagementActions({
  bookingId,
  startAt,
  studioId,
  timezone,
  sourcePrice,
  now,
  transferUsed,
  transferBlocked,
  transferOperationId,
  transferStatus,
  transferDeadlineAt,
  transferAdjustmentPaymentGroupId,
  transferRefundStatus,
  transferManualResolutionRequired,
  latePaymentRefundActive,
  onComplete,
}: Props) {
  const [cancellationState, setCancellationState] =
    useState<CancellationState>(null);
  const [cancellationMessage, setCancellationMessage] = useState("");
  const [canceling, setCanceling] = useState(false);

  const start = Date.parse(startAt);
  const confirmed =
    Number.isFinite(start) &&
    start > now &&
    !transferManualResolutionRequired;

  const cancellable =
    confirmed &&
    start > now + 24 * 60 * 60 * 1000;

  const canRecoverTransfer =
    !transferUsed &&
    !transferManualResolutionRequired &&
    !latePaymentRefundActive &&
    Boolean(transferOperationId) &&
    (
      (
        transferStatus === "awaiting_payment" &&
        Boolean(transferAdjustmentPaymentGroupId)
      ) ||
      transferStatus === "processing"
    );

  const cancelBooking = async () => {
    if (canceling) return;

    setCanceling(true);
    setCancellationState("processing");
    setCancellationMessage("Проверяем возможность возврата...");

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

      if (
        response.status === 202 ||
        result.state === "processing"
      ) {
        setCancellationState("processing");
        setCancellationMessage(
          result.message ||
            "Возврат обрабатывается. Бронирование пока остаётся активным.",
        );
        return;
      }

      if (!response.ok) {
        throw new Error(
          result.error || "Не удалось выполнить отмену.",
        );
      }

      if (result.state === "completed") {
        setCancellationState("completed");
        setCancellationMessage(
          "Возврат подтверждён. Бронирование отменено.",
        );
        onComplete();
        return;
      }

      throw new Error(
        "Сервер не подтвердил завершение возврата.",
      );
    } catch (error) {
      setCancellationState("error");
      setCancellationMessage(
        error instanceof Error
          ? error.message
          : "Ошибка проверки возврата. Попробуйте позже.",
      );
    } finally {
      setCanceling(false);
    }
  };

  if (!confirmed) return null;

  return (
    <div className="mt-3 space-y-3">
      {!transferUsed && !transferBlocked && (
        <BookingTransferAction
          bookingId={bookingId}
          startAt={startAt}
          studioId={studioId}
          timezone={timezone}
          sourcePrice={sourcePrice}
          transferDeadlineAt={transferDeadlineAt}
          onComplete={onComplete}
        />
      )}

      {canRecoverTransfer && (
        <BookingTransferAction
          bookingId={bookingId}
          startAt={startAt}
          studioId={studioId}
          timezone={timezone}
          sourcePrice={sourcePrice}
          transferDeadlineAt={transferDeadlineAt}
          recoveryOperationId={transferOperationId}
          recoveryStatus={transferStatus}
          adjustmentPaymentGroupId={
            transferAdjustmentPaymentGroupId
          }
          refundStatus={transferRefundStatus}
          manualResolutionRequired={
            transferManualResolutionRequired
          }
          onComplete={onComplete}
        />
      )}

      {cancellable && cancellationState === null && (
        <div className="border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setCancellationState("confirm")}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-400/25 px-4 text-sm text-red-200 transition hover:bg-red-400/10"
          >
            <X size={15} />
            Отменить бронирование
          </button>

          <p className="mt-2 text-xs leading-5 text-white/40">
            При отмене более чем за 24 часа до начала
            возвращается полная стоимость.
          </p>
        </div>
      )}

      {cancellationState === "confirm" && (
        <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0 text-amber-200"
            />

            <div>
              <p className="text-sm font-semibold text-white">
                Подтвердить отмену?
              </p>
              <p className="mt-1 text-xs leading-5 text-white/60">
                Будет запрошен полный возврат стоимости
                бронирования на исходный способ оплаты.
                Бронь отменится только после подтверждения
                возврата YooKassa.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void cancelBooking()}
              disabled={canceling}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-500/90 px-4 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              Подтвердить отмену
            </button>

            <button
              type="button"
              onClick={() => setCancellationState(null)}
              className="h-10 rounded-xl border border-white/10 px-4 text-sm text-white/70 hover:bg-white/[0.06]"
            >
              Не отменять
            </button>
          </div>
        </div>
      )}

      {(cancellationState === "processing" ||
        cancellationState === "error" ||
        cancellationState === "completed") && (
        <div
          className={`rounded-xl border p-3 ${
            cancellationState === "completed"
              ? "border-emerald-400/20 bg-emerald-400/[0.06]"
              : cancellationState === "error"
                ? "border-red-400/20 bg-red-400/[0.06]"
                : "border-amber-300/20 bg-amber-300/[0.06]"
          }`}
        >
          <div className="flex items-start gap-2">
            {cancellationState === "completed" ? (
              <CheckCircle2
                size={17}
                className="mt-0.5 shrink-0 text-emerald-300"
              />
            ) : cancellationState === "error" ? (
              <AlertTriangle
                size={17}
                className="mt-0.5 shrink-0 text-red-300"
              />
            ) : (
              <Loader2
                size={17}
                className="mt-0.5 shrink-0 animate-spin text-amber-200"
              />
            )}

            <p className="text-xs leading-5 text-white/80">
              {cancellationMessage}
            </p>
          </div>

          {(cancellationState === "processing" ||
            cancellationState === "error") && (
            <button
              type="button"
              onClick={() => void cancelBooking()}
              disabled={canceling}
              className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs text-white/80 hover:bg-white/[0.06] disabled:opacity-50"
            >
              <RotateCcw size={13} />
              Проверить возврат
            </button>
          )}
        </div>
      )}

      {!cancellable &&
        start > now &&
        start <= now + 24 * 60 * 60 * 1000 && (
          <p className="text-xs leading-5 text-white/40">
            Самостоятельная отмена недоступна менее чем за
            24 часа до начала сессии.
          </p>
        )}
    </div>
  );
}
