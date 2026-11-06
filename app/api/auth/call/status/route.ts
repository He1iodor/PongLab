
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";

export const runtime = "nodejs";

function privateJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function errorResponse(message: string, status: number) {
  return privateJson({ error: message }, { status });
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

    // Атомарно проверяем принадлежность, статус, срок действия
    // и интервал между запросами.
    const claimResponse = await dbRequest(
      "rpc/claim_phone_auth_status_poll",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_challenge_id: challengeId,
          p_browser_token_hash: browserTokenHash,
        }),
      },
    );

    if (!claimResponse.ok) {
      console.error(
        "Supabase status poll claim failed. HTTP status:",
        claimResponse.status,
      );

      return errorResponse(
        "Не удалось проверить запрос.",
        503,
      );
    }

    const claimRows = await claimResponse.json();
    const claim = Array.isArray(claimRows)
      ? claimRows[0]
      : null;

    if (!claim || typeof claim.result_code !== "string") {
      console.error("Invalid status poll claim response");

      return errorResponse(
        "Временная ошибка сервиса.",
        503,
      );
    }

    if (!claim.allowed) {
      if (claim.result_code === "not_found") {
        return errorResponse(
          "Проверка не найдена или не принадлежит этому браузеру.",
          403,
        );
      }

      if (
        claim.result_code === "not_pending" ||
        claim.result_code === "expired"
      ) {
        return errorResponse(
          "Эта проверка завершена или истекла. Запросите новый звонок.",
          410,
        );
      }

      if (claim.result_code === "rate_limited") {
        return privateJson(
          {
            verified: false,
            status: "pending",
          },
          {
            status: 429,
            headers: {
              "Retry-After": "3",
            },
          },
        );
      }

      console.error(
        "Unexpected status poll claim result:",
        claim.result_code,
      );

      return errorResponse(
        "Не удалось проверить статус авторизации.",
        503,
      );
    }

    if (
      typeof claim.provider_check_id !== "string" ||
      !claim.provider_check_id ||
      typeof claim.expires_at !== "string"
    ) {
      console.error("Invalid challenge data returned by PostgreSQL");

      return errorResponse(
        "Не удалось получить данные проверки.",
        503,
      );
    }

    // Только SMS.RU может подтвердить факт звонка.
    const params = new URLSearchParams({
      api_id: apiId,
      check_id: claim.provider_check_id,
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

      return errorResponse(
        "Не удалось проверить статус звонка.",
        502,
      );
    }

    const smsResult = await smsResponse.json();

    if (
      smsResult.status !== "OK" ||
      Number(smsResult.status_code) !== 100
    ) {
      console.error("SMS.RU status request failed:", {
        status: smsResult.status,
        status_code: smsResult.status_code,
        status_text: smsResult.status_text,
      });

      return errorResponse(
        "Не удалось получить статус звонка. Попробуйте позже.",
        502,
      );
    }

    const providerCode = Number(smsResult.check_status);

    // Звонок ещё не подтверждён.
    if (providerCode === 400) {
      return privateJson({
        verified: false,
        status: "pending",
      });
    }

    // SMS.RU сообщает, что время проверки истекло.
    if (providerCode === 402) {
      const expireResponse = await dbRequest(
        `phone_auth_challenges?id=eq.${challengeId}&status=eq.pending&browser_token_hash=eq.${browserTokenHash}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "expired",
          }),
        },
      );

      if (!expireResponse.ok) {
        console.error(
          "Failed to expire phone challenge. HTTP status:",
          expireResponse.status,
        );
      }

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

    // Создаём случайный токен сессии.
    // В базе будет храниться только его хеш.
    const sessionToken = randomBytes(32).toString("hex");
    const sessionTokenHash = hashToken(sessionToken);

    // Одноразовое погашение проверки и создание сессии
    // выполняются одной транзакцией внутри PostgreSQL.
    const consumeResponse = await dbRequest(
      "rpc/consume_phone_auth_challenge",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_challenge_id: challengeId,
          p_browser_token_hash: browserTokenHash,
          p_session_token_hash: sessionTokenHash,
        }),
      },
    );

    if (!consumeResponse.ok) {
      console.error(
        "Supabase challenge consumption failed. HTTP status:",
        consumeResponse.status,
      );

      return errorResponse(
        "Не удалось завершить авторизацию.",
        503,
      );
    }

    const consumedRows = await consumeResponse.json();
    const consumed = Array.isArray(consumedRows)
      ? consumedRows[0]
      : null;

    if (!consumed?.user_id || !consumed?.session_expires_at) {
      return errorResponse(
        "Проверка уже использована или истекла. Начните заново.",
        409,
      );
    }

    const sessionExpiresAt = new Date(
      consumed.session_expires_at,
    );

    if (Number.isNaN(sessionExpiresAt.getTime())) {
      console.error("Invalid session expiry returned by database");

      return errorResponse(
        "Не удалось завершить авторизацию.",
        503,
      );
    }

    const response = privateJson({
      verified: true,
    });

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
  } catch {
    // Не записываем объект ошибки: он может содержать URL,
    // идентификаторы проверки или другие внутренние данные.
    console.error("Call verification failed");

    return errorResponse(
      "Временная ошибка сервера.",
      500,
    );
  }
}
