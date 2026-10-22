
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";

export const runtime = "nodejs";

const jsonHeaders = {
  "Content-Type": "application/json",
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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

export async function POST(request: NextRequest) {
  try {
    const smsApiId = process.env.SMS_RU_API_ID;

    if (!smsApiId) {
      return errorResponse("Сервис авторизации пока не настроен.", 500);
    }

    let body: { phone?: unknown };

    try {
      body = await request.json();
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

    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const recentQuery = new URLSearchParams({
      select: "id",
      phone: `eq.${phone}`,
      created_at: `gte.${cutoff}`,
      limit: "3",
    });

    const recentResponse = await supabaseRequest(
      `phone_auth_challenges?${recentQuery.toString()}`,
    );

    if (!recentResponse.ok) {
      console.error(
        "Supabase rate-limit query failed:",
        await recentResponse.text(),
      );
      return errorResponse("Не удалось проверить запрос. Попробуйте позже.", 503);
    }

    const recentAttempts = await recentResponse.json();

    if (!Array.isArray(recentAttempts)) {
      return errorResponse("Временная ошибка сервиса.", 503);
    }

    if (recentAttempts.length >= 3) {
      return errorResponse(
        "Слишком много попыток для этого номера. Попробуйте позже.",
        429,
      );
    }

    // IP из заголовка используется только как дополнительная информация.
    // Доверять ему для защиты от атак можно лишь при корректной настройке прокси.
    const forwardedFor = request.headers.get("x-forwarded-for");
    const userIp = forwardedFor?.split(",")[0]?.trim();

    const smsParams = new URLSearchParams({
      api_id: smsApiId,
      phone,
      json: "1",
    });

    if (userIp) {
      smsParams.set("ip", userIp);
    }

    const smsResponse = await fetch("https://sms.ru/callcheck/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: smsParams.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!smsResponse.ok) {
      console.error("SMS.RU HTTP error:", smsResponse.status);
      return errorResponse(
        "Не удалось связаться с сервисом проверки. Попробуйте позже.",
        502,
      );
    }

    const smsResult = await smsResponse.json();

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

      return errorResponse(
        "SMS.RU не смог начать проверку. Попробуйте позже.",
        502,
      );
    }

    // Секрет уникален для каждой попытки. В базе хранится только его хеш.
    const browserToken = randomBytes(32).toString("hex");
    const browserTokenHash = hashToken(browserToken);

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const insertResponse = await supabaseRequest(
      "phone_auth_challenges",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          phone,
          provider_check_id: String(smsResult.check_id),
          browser_token_hash: browserTokenHash,
          status: "pending",
          expires_at: expiresAt,
        }),
      },
    );

   if (!insertResponse.ok) {
  const errorText = await insertResponse.text();

  if (
    insertResponse.status === 409 ||
    errorText.includes("phone_auth_challenges_provider_check_id_key") ||
    errorText.includes("duplicate key value")
  ) {
    console.error(
      "SMS.RU returned a duplicate check_id. New challenge was not saved.",
    );

    return errorResponse(
      "Сервис проверки временно вернул повторный идентификатор. Подождите минуту и попробуйте снова.",
      503,
    );
  }

  console.error("Supabase challenge insert failed:", errorText);

  return errorResponse(
    "Не удалось сохранить проверку. Попробуйте позже.",
    503,
  );
}
    const response = NextResponse.json(
      {
        challengeId: savedChallenge.id,
        callPhone: smsResult.call_phone_pretty || smsResult.call_phone,
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
    return errorResponse("Временная ошибка сервера. Попробуйте ещё раз.", 500);
  }
}
