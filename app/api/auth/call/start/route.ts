
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";

export const runtime = "nodejs";

function privateJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

const jsonHeaders = {
  "Content-Type": "application/json",
};

function errorResponse(message: string, status: number) {
  return privateJson({ error: message }, { status });
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const digits = value.replace(/\D/g, "");
  let phone: string;

  if (digits.length === 10) {
    phone = `7${digits}`;
  } else if (digits.length === 11 && digits.startsWith("8")) {
    phone = `7${digits.slice(1)}`;
  } else if (digits.length === 11 && digits.startsWith("7")) {
    phone = digits;
  } else {
    return null;
  }

  return /^79\d{9}$/.test(phone) ? phone : null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function supabaseRequest(
  path: string,
  init: RequestInit = {},
) {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error("Supabase environment variables are missing");
  }

  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      ...init.headers,
    },
  });
}

// Помечаем зарезервированную попытку как failed.
// Ошибка этой операции не должна скрывать исходную ошибку.
async function markReservationFailed(reservationId: string) {
  try {
    const response = await supabaseRequest(
      `phone_auth_challenges?id=eq.${reservationId}&status=eq.pending`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "failed",
        }),
      },
    );

    if (!response.ok) {
      console.error(
        "Failed to mark phone challenge as failed:",
        await response.text(),
      );
    }
  } catch (error) {
    console.error(
      "Failed to update reserved phone challenge:",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}

export async function POST(request: NextRequest) {
  let reservationId: string | null = null;

  try {
    const smsApiId = process.env.SMS_RU_API_ID;

    if (!smsApiId) {
      return errorResponse(
        "Сервис авторизации пока не настроен.",
        500,
      );
    }

    let body: { phone?: unknown };

    try {
      const parsedBody = await request.json();

      if (
        !parsedBody ||
        typeof parsedBody !== "object" ||
        Array.isArray(parsedBody)
      ) {
        return errorResponse("Некорректный запрос.", 400);
      }

      body = parsedBody as { phone?: unknown };
    } catch {
      return errorResponse("Некорректный запрос.", 400);
    }

    const phone = normalizePhone(body.phone);

    if (!phone) {
      return errorResponse(
        "Введите корректный российский мобильный номер.",
        400,
      );
    }

    // 1. Атомарно резервируем попытку в PostgreSQL.
    const reserveResponse = await supabaseRequest(
      "rpc/reserve_phone_auth_challenge",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_phone: phone,
        }),
      },
    );

    if (!reserveResponse.ok) {
      console.error(
        "Phone challenge reservation failed:",
        await reserveResponse.text(),
      );

      return errorResponse(
        "Не удалось проверить возможность авторизации. Попробуйте позже.",
        503,
      );
    }

    const reserveRows = await reserveResponse.json();
    const reservation = Array.isArray(reserveRows)
      ? reserveRows[0]
      : null;

    if (
      !reservation ||
      typeof reservation.allowed !== "boolean"
    ) {
      console.error("Invalid reservation response from Supabase");

      return errorResponse(
        "Временная ошибка сервиса.",
        503,
      );
    }

    if (!reservation.allowed) {
      return errorResponse(
        "Слишком много попыток для этого номера. Попробуйте позже.",
        429,
      );
    }

    if (typeof reservation.challenge_id !== "string") {
      console.error("Reservation returned no challenge ID");

      return errorResponse(
        "Не удалось зарезервировать проверку.",
        503,
      );
    }

    reservationId = reservation.challenge_id;

    // IP передаётся SMS.RU как дополнительная информация.
    // Не используем x-forwarded-for самостоятельно для защиты.
    const forwardedFor = request.headers.get("x-forwarded-for");
    const userIp = forwardedFor?.split(",")[0]?.trim();

    // 2. Запрашиваем проверочный звонок у SMS.RU.
    const smsParams = new URLSearchParams({
      api_id: smsApiId,
      phone,
      json: "1",
    });

    if (userIp) {
      smsParams.set("ip", userIp);
    }

    const smsResponse = await fetch(
      "https://sms.ru/callcheck/add",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: smsParams.toString(),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!smsResponse.ok) {
      console.error("SMS.RU HTTP error:", smsResponse.status);

      if (reservationId !== null) {
        await markReservationFailed(reservationId);
      }
      reservationId = null;

      return errorResponse(
        "Не удалось связаться с сервисом проверки. Попробуйте позже.",
        502,
      );
    }

    const smsResult = await smsResponse.json();

    console.log("SMS.RU callcheck/add diagnostic:", {
      status: smsResult.status,
      status_code: smsResult.status_code,
      check_id: smsResult.check_id,
      call_phone: smsResult.call_phone,
      status_text: smsResult.status_text,
    });

    if (
      smsResult.status !== "OK" ||
      Number(smsResult.status_code) !== 100 ||
      !smsResult.check_id ||
      !smsResult.call_phone
    ) {
      console.error("SMS.RU rejected request:", {
        status: smsResult.status,
        status_code: smsResult.status_code,
        status_text: smsResult.status_text,
      });

      await markReservationFailed(reservationId);
      reservationId = null;

      return errorResponse(
        "SMS.RU не смог начать проверку. Попробуйте позже.",
        502,
      );
    }

    // 3. Создаём секрет для привязки проверки к браузеру.
    const browserToken = randomBytes(32).toString("hex");
    const browserTokenHash = hashToken(browserToken);

    const expiresAt = new Date(
      Date.now() + 5 * 60 * 1000,
    ).toISOString();

    // 4. Обновляем резервную запись данными SMS.RU.
    const updateResponse = await supabaseRequest(
      `phone_auth_challenges?id=eq.${reservationId}&status=eq.pending`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          provider_check_id: String(smsResult.check_id),
          browser_token_hash: browserTokenHash,
          expires_at: expiresAt,
        }),
      },
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();

      console.error(
        "Supabase challenge update failed:",
        errorText,
      );

      await markReservationFailed(reservationId);
      reservationId = null;

      if (
        updateResponse.status === 409 ||
        errorText.includes(
          "phone_auth_challenges_provider_check_id_key",
        ) ||
        errorText.includes("duplicate key value")
      ) {
        return errorResponse(
          "Сервис проверки временно вернул повторный идентификатор. Подождите минуту и попробуйте снова.",
          503,
        );
      }

      return errorResponse(
        "Не удалось сохранить проверку. Попробуйте позже.",
        503,
      );
    }

    const savedRows = await updateResponse.json();
    const savedChallenge = Array.isArray(savedRows)
      ? savedRows[0]
      : null;

    if (!savedChallenge?.id) {
      await markReservationFailed(reservationId);
      reservationId = null;

      return errorResponse(
        "Не удалось сохранить проверку.",
        503,
      );
    }

    // Резервирование успешно превращено в полноценную проверку.
    reservationId = null;

    const response = privateJson(
      {
        challengeId: savedChallenge.id,
        callPhone:
          smsResult.call_phone_pretty || smsResult.call_phone,
        callPhoneHtml: smsResult.call_phone_html || null,
        expiresAt,
      },
      { headers: jsonHeaders },
    );

    response.cookies.set(
      `ponglab_auth_${savedChallenge.id}`,
      browserToken,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        expires: new Date(expiresAt),
      },
    );

    return response;
  } catch (error) {
    console.error("Call authorization start failed:", error);

    if (reservationId) {
      await markReservationFailed(reservationId);
    }

    return errorResponse(
      "Временная ошибка сервера. Попробуйте ещё раз.",
      500,
    );
  }
}
