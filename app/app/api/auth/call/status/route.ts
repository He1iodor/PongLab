
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function dbRequest(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are missing");
  }

  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...init.headers,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const apiId = process.env.SMS_RU_API_ID;

    if (!apiId) {
      return errorResponse("Сервис авторизации не настроен.", 500);
    }

    let body: { challengeId?: unknown };

    try {
      body = await request.json();
    } catch {
      return errorResponse("Некорректный запрос.", 400);
    }

    const challengeId = body.challengeId;

    if (
      typeof challengeId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        challengeId,
      )
    ) {
      return errorResponse("Некорректный идентификатор проверки.", 400);
    }

    // Проверяем секрет, выданный именно этому браузеру для этой проверки.
    const cookieName = `ponglab_auth_${challengeId}`;
    const browserToken = request.cookies.get(cookieName)?.value;

    if (!browserToken || !/^[0-9a-f]{64}$/i.test(browserToken)) {
      return errorResponse(
        "Проверка привязана к другому браузеру. Начните заново.",
        403,
      );
    }

    const browserTokenHash = hashToken(browserToken);

    const query = new URLSearchParams({
      select: "id,phone,provider_check_id,status,expires_at",
      id: `eq.${challengeId}`,
      browser_token_hash: `eq.${browserTokenHash}`,
      limit: "1",
    });

    const challengeResponse = await dbRequest(
      `phone_auth_challenges?${query.toString()}`,
    );

    if (!challengeResponse.ok) {
      console.error(
        "Supabase challenge lookup failed:",
        await challengeResponse.text(),
      );
      return errorResponse("Не удалось проверить запрос.", 503);
    }

    const challenges = await challengeResponse.json();
    const challenge = challenges[0];

    if (!challenge) {
      return errorResponse(
        "Проверка не найдена или не принадлежит этому браузеру.",
        403,
      );
    }

    if (challenge.status !== "pending") {
      return errorResponse(
        "Эта проверка уже завершена или недействительна. Начните заново.",
        410,
      );
    }

    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      await dbRequest(
        `phone_auth_challenges?id=eq.${challengeId}&status=eq.pending&browser_token_hash=eq.${browserTokenHash}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "expired" }),
        },
      );

      return errorResponse(
        "Время проверки истекло. Запросите звонок заново.",
        410,
      );
    }

    // Только SMS.RU может подтвердить факт звонка.
    const params = new URLSearchParams({
      api_id: apiId,
      check_id: String(challenge.provider_check_id),
      json: "1",
    });

    const smsResponse = await fetch(
      `https://sms.ru/callcheck/status?${params.toString()}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!smsResponse.ok) {
      console.error("SMS.RU HTTP error:", smsResponse.status);
      return errorResponse("Не удалось проверить статус звонка.", 502);
    }

    const smsResult = await smsResponse.json();
    const providerCode = Number(smsResult.status_code);

    if (providerCode === 400) {
      return NextResponse.json({
        verified: false,
        status: "pending",
      });
    }

    if (providerCode === 402) {
      await dbRequest(
        `phone_auth_challenges?id=eq.${challengeId}&status=eq.pending&browser_token_hash=eq.${browserTokenHash}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "expired" }),
        },
      );

      return errorResponse(
        "Звонок не подтверждён вовремя. Запросите новый.",
        410,
      );
    }

    if (providerCode !== 401) {
      console.error("Unexpected SMS.RU status response:", {
        status: smsResult.status,
        status_code: smsResult.status_code,
        status_text: smsResult.status_text,
      });

      return errorResponse(
        "Не удалось подтвердить звонок. Попробуйте позже.",
        502,
      );
    }

    // Создаём случайный токен сессии. В базе будет только его хеш.
    const sessionToken = randomBytes(32).toString("hex");
    const sessionTokenHash = hashToken(sessionToken);

    // Одноразовое погашение проверки и создание сессии
    // выполняются одной транзакцией внутри PostgreSQL.
    const consumeResponse = await dbRequest(
      "rpc/consume_phone_auth_challenge",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_challenge_id: challengeId,
          p_browser_token_hash: browserTokenHash,
          p_session_token_hash: sessionTokenHash,
        }),
      },
    );

    if (!consumeResponse.ok) {
      console.error(
        "Supabase challenge consumption failed:",
        await consumeResponse.text(),
      );
      return errorResponse("Не удалось завершить авторизацию.", 503);
    }

    const consumedRows = await consumeResponse.json();
    const consumed = Array.isArray(consumedRows) ? consumedRows[0] : null;

    if (!consumed?.user_id || !consumed?.session_expires_at) {
      return errorResponse(
        "Проверка уже использована или истекла. Начните заново.",
        409,
      );
    }

    const sessionExpiresAt = new Date(consumed.session_expires_at);

    if (Number.isNaN(sessionExpiresAt.getTime())) {
      console.error("Invalid session expiry returned by database");
      return errorResponse("Не удалось завершить авторизацию.", 503);
    }

    const response = NextResponse.json({ verified: true });

    response.cookies.set("ponglab_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: sessionExpiresAt,
    });

    // После успешного входа больше не нужен секрет проверки звонка.
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: new Date(0),
    });

    return response;
  } catch (error) {
    console.error("Call verification failed:", error);
    return errorResponse("Временная ошибка сервера.", 500);
  }
}
