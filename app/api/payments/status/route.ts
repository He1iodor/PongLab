
import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTokenFromRequest,
  getYooKassaPayment,
  isUuid,
  resolveSessionUserId,
  supabaseRpc,
  syncYooKassaPayment,
  type PaymentSyncResult,
} from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentGroupStatus = {
  payment_group_id: string;
  payment_status: string;
  provider: string;
  provider_payment_id: string | null;
  amount_rub: number;
  currency: string;
  hold_expires_at: string | null;
  payment_init_started_at: string | null;
  booking_count: number;
  pending_booking_count: number;
  confirmed_booking_count: number;
};

type TransferOperationStatus = {
  id: string;
  status: string;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

function errorStatusCode(error: unknown): number | null {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return null;
}

async function readTransferOperation(
  paymentGroupId: string,
  userId: string,
): Promise<TransferOperationStatus | null> {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase configuration is not available.");
  }

  const target = new URL(
    `${supabaseUrl}/rest/v1/booking_operations`,
  );

  target.searchParams.set(
    "select",
    "id,status,completed_at,metadata",
  );
  target.searchParams.set("user_id", `eq.${userId}`);
  target.searchParams.set(
    "adjustment_payment_group_id",
    `eq.${paymentGroupId}`,
  );
  target.searchParams.set("operation_type", "eq.transfer");
  target.searchParams.set("limit", "1");

  const response = await fetch(target, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    console.error(
      "[payment-status] transfer operation lookup failed",
      { httpStatus: response.status },
    );

    throw new Error("Transfer operation lookup failed.");
  }

  const rows: unknown = await response.json();

  if (!Array.isArray(rows)) {
    throw new Error("Invalid transfer operation response.");
  }

  return (rows[0] as TransferOperationStatus | undefined) ?? null;
}

function hasManualResolution(
  metadata: Record<string, unknown> | null,
) {
  return metadata?.manual_resolution_required === true;
}

export async function GET(request: NextRequest) {
  const sessionToken = getSessionTokenFromRequest(request);

  if (!sessionToken) {
    return errorResponse("Войдите в личный кабинет.", 401);
  }

  const paymentGroupId =
    request.nextUrl.searchParams.get("payment_group_id");

  if (!isUuid(paymentGroupId)) {
    return errorResponse(
      "Некорректный идентификатор бронирования.",
      400,
    );
  }

  try {
    const userId = await resolveSessionUserId(sessionToken);

    if (!userId) {
      return errorResponse(
        "Сессия истекла. Войдите повторно.",
        401,
      );
    }

    const readStatus = async () => {
      const rows = await supabaseRpc<PaymentGroupStatus[]>(
        "get_payment_group_status",
        {
          p_payment_group_id: paymentGroupId,
          p_user_id: userId,
        },
      );

      return Array.isArray(rows) ? rows[0] ?? null : null;
    };

    let group = await readStatus();

    if (!group) {
      return errorResponse("Бронирование не найдено.", 404);
    }

    let syncResult: PaymentSyncResult | null = null;

    // Проверяем обычные незавершённые платежи и платежи,
    // которые были локально отменены по тайм-ауту.
    if (
      group.provider_payment_id &&
      (group.payment_status === "pending" ||
        group.payment_status === "cancelled")
    ) {
      const payment = await getYooKassaPayment(
        group.provider_payment_id,
      );

      syncResult = await syncYooKassaPayment(
        payment,
        paymentGroupId,
      );

      console.info("[payment-status] YooKassa status checked", {
        providerStatus: syncResult.providerStatus,
        cancellationReason:
          typeof syncResult.payment.cancellation_details?.reason ===
          "string"
            ? syncResult.payment.cancellation_details.reason
            : null,
        databaseResult: syncResult.databaseResult ?? null,
      });

      // После синхронизации перечитываем состояние БД.
      group = await readStatus();

      if (!group) {
        return errorResponse(
          "Бронирование не найдено.",
          404,
        );
      }
    }

    // Ищем операцию переноса по adjustment_payment_group_id.
    // Запрос ограничен текущим владельцем и типом transfer.
    const transferOperation = await readTransferOperation(
      paymentGroupId,
      userId,
    );

    const baseState =
      group.payment_status === "succeeded"
        ? "succeeded"
        : group.payment_status === "refunded"
          ? "refunded"
          : group.payment_status === "cancelled" ||
              group.payment_status === "failed"
            ? "cancelled"
            : "pending";

    const refundRequired =
      syncResult?.databaseResult ===
      "late_success_refund_required";

    const monitorLatePayment =
      group.payment_status === "cancelled" &&
      Boolean(group.provider_payment_id) &&
      syncResult?.providerStatus === "pending";

    let state = baseState;

    if (transferOperation) {
      if (refundRequired) {
        state = "transfer_refund_required";
      } else if (group.payment_status === "refunded") {
        state = "transfer_refunded";
      } else if (monitorLatePayment) {
        state = "transfer_monitoring";
      } else if (group.payment_status === "succeeded") {
        state =
          transferOperation.status === "completed"
            ? "transfer_completed"
            : "transfer_review";
      } else if (
        group.payment_status === "cancelled" ||
        group.payment_status === "failed"
      ) {
        state =
          transferOperation.status === "failed" ||
          transferOperation.status === "expired"
            ? "transfer_cancelled"
            : "transfer_review";
      } else if (group.payment_status === "pending") {
        state = "transfer_pending";
      } else {
        state = "transfer_review";
      }
    }

    // Не показываем ложное сообщение об успешной обычной брони,
    // если платёж успешен, но подтверждённой записи нет.
    const confirmationMissing =
      !transferOperation &&
      group.payment_status === "succeeded" &&
      group.booking_count > 0 &&
      group.confirmed_booking_count === 0;

    if (confirmationMissing) {
      state = "review_required";
    }

    return NextResponse.json(
      {
        payment_group_id: group.payment_group_id,
        state,
        amount_rub: group.amount_rub,
        currency: group.currency,
        hold_expires_at: group.hold_expires_at,
        booking_count: group.booking_count,
        confirmed_booking_count:
          group.confirmed_booking_count,
        payment_initialization_started: Boolean(
          group.payment_init_started_at,
        ),
        monitor_late_payment: monitorLatePayment,
        refund_required: refundRequired,
        confirmation_missing: confirmationMissing,

        purpose: transferOperation
          ? "transfer_adjustment"
          : "booking",

        transfer_status: transferOperation?.status ?? null,
        transfer_completed_at:
          transferOperation?.completed_at ?? null,
        transfer_manual_resolution_required:
          transferOperation
            ? hasManualResolution(transferOperation.metadata)
            : false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[payment-status] lookup failed", {
      errorName: errorName(error),
      httpStatus: errorStatusCode(error),
    });

    return errorResponse(
      "Не удалось проверить статус оплаты. Повторите попытку.",
      503,
    );
  }
}
