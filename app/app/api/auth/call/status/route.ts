
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";

export const runtime = "nodejs";

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

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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

    const query = new URLSearchParams({
      select: "id,phone,provider_check_id,status,expires_at",
      id: `eq.${challengeId}`,
      limit: "1",
    });

    const challengeResponse = await dbRequest(
      `phone_auth_challenges?${query.toString()}`,
    );

    if (!challengeResponse.ok) {
      console.error("Supabase challenge lookup failed:", await challengeResponse.text());
      return errorResponse("Не удалось проверить запрос.", 503);
    }

    const challenges = await challengeResponse.json();
    const challenge = challenges[0];

    if (!challenge) {
      return errorResponse("Проверка не найдена. Запросите звонок заново.", 404);
    }

    if (challenge.status === "expired" || challenge.status === "failed") {
      return errorResponse("Время проверки истекло. Запросите звонок заново.", 410);
    }

    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      await dbRequest(
        `phone_auth_challenges?id=eq.${challengeId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "expired" }),
        },
      );

      return errorResponse("Время проверки истекло. Запросите звонок заново.", 410);
    }

    if (challenge.status !== "verified") {
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
        return errorResponse("Не удалось проверить статус звонка.", 502);
      }

      const smsResult = await smsResponse.json();
      const providerCode = Number(smsResult.status_code);

      if (providerCode === 400) {
        return NextResponse.json({ verified: false, status: "pending" });
      }

      if (providerCode === 402) {
        await dbRequest(
          `phone_auth_challenges?id=eq.${challengeId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "expired" }),
          },
        );

        return errorResponse("Звонок не подтверждён вовремя. Запросите новый.", 410);
      }

      if (providerCode !== 401) {
        console.error("Unexpected SMS.RU status response:", {
          status: smsResult.status,
          status_code: smsResult.status_code,
          status_text: smsResult.status_text,
        });

        return errorResponse("SMS.RU вернул неожиданный статус проверки.", 502);
      }
    }

    // Находим пользователя по уникальному номеру или создаём его.
    const userResponse = await dbRequest(
      "users?on_conflict=phone",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({ phone: challenge.phone }),
      },
    );

    if (!userResponse.ok) {
      console.error("Supabase user upsert failed:", await userResponse.text());
      return errorResponse("Не удалось создать сессию пользователя.", 503);
    }

    const users = await userResponse.json();
    const user = users[0];

    if (!user?.id) {
      return errorResponse("Не удалось получить пользователя.", 503);
    }

    // Случайный токен хранится в браузере, а в базе — только его SHA-256.
    const sessionToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256")
      .update(sessionToken)
      .digest("hex");

    const sessionExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const sessionResponse = await dbRequest("user_sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: sessionExpiresAt,
      }),
    });

    if (!sessionResponse.ok) {
      console.error("Supabase session insert failed:", await sessionResponse.text());
      return errorResponse("Не удалось создать сессию.", 503);
    }

    // Отмечаем попытку подтверждённой только после создания сессии.
    const updateResponse = await dbRequest(
      `phone_auth_challenges?id=eq.${challengeId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "verified" }),
      },
    );

    if (!updateResponse.ok) {
      console.error("Supabase challenge update failed:", await updateResponse.text());
      return errorResponse("Не удалось завершить проверку.", 503);
    }

    const response = NextResponse.json({ verified: true });

    response.cookies.set("ponglab_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(sessionExpiresAt),
    });

    return response;
  } catch (error) {
    console.error("Call verification failed:", error);
    return errorResponse("Временная ошибка сервера.", 500);
  }
}
