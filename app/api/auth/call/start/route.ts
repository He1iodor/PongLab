
import { NextRequest, NextResponse } from "next/server";

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

  // Российский мобильный номер: 7 + 10 цифр.
  if (!/^79\d{9}$/.test(phone)) return null;

  return phone;
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

    // Ограничиваем количество попыток для одного номера:
    // не более 3 запросов за 30 минут.
    const cutoff = new Date(
      Date.now() - 30 * 60 * 1000,
    ).toISOString();

    const recentQuery = new URLSearchParams({
      select: "id",
      phone: `eq.${phone}`,
      created_at: `gte.${cutoff}`,
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

    if (
      !Array.isArray(recentAttempts) ||
      recentAttempts.length >= 3
    ) {
      if (!Array.isArray(recentAttempts)) {
        return errorResponse("Временная ошибка сервиса.", 503);
      }

      return errorResponse(
        "Слишком много попыток для этого номера. Попробуйте позже.",
        429,
      );
    }

    // Передаём SMS.RU номер пользователя и его IP, если он доступен.
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
        "SMS.RU не смог начать проверку. Проверьте настройки сервиса и попробуйте позже.",
        502,
      );
    }

    const expiresAt = new Date(
      Date.now() + 5 * 60 * 1000,
    ).toISOString();

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
          status: "pending",
          expires_at: expiresAt,
        }),
      },
    );

    if (!insertResponse.ok) {
      console.error(
        "Supabase challenge insert failed:",
        await insertResponse.text(),
      );

      return errorResponse(
        "Не удалось сохранить проверку. Попробуйте позже.",
        503,
      );
    }

    const savedRows = await insertResponse.json();
    const savedChallenge = savedRows[0];

    if (!savedChallenge?.id) {
      return errorResponse("Не удалось сохранить проверку.", 503);
    }

    return NextResponse.json(
      {
        challengeId: savedChallenge.id,
        callPhone: smsResult.call_phone_pretty || smsResult.call_phone,
        callPhoneHtml: smsResult.call_phone_html || null,
        expiresAt,
      },
      { headers: jsonHeaders },
    );
  } catch (error) {
    console.error("Call authorization start failed:", error);

    return errorResponse(
      "Временная ошибка сервера. Попробуйте ещё раз.",
      500,
    );
  }
}
