
import { NextRequest, NextResponse } from "next/server";
import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER_COOKIE = "ponglab_owner";
const OWNER_SESSION_SECONDS = 7 * 24 * 60 * 60;

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  return left.length === right.length && timingSafeEqual(left, right);
}

function signOwnerSession(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("Недопустимый запрос.", 403);
  }

  const sessionToken = request.cookies.get("ponglab_session")?.value;

  if (!sessionToken || !/^[a-f0-9]{64}$/i.test(sessionToken)) {
    return errorResponse("Сначала войдите по номеру телефона.", 401);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const ownerPassword = process.env.OWNER_PASSWORD;
  const ownerSessionSecret = process.env.OWNER_SESSION_SECRET;

  if (!supabaseUrl || !supabaseKey || !ownerPassword || !ownerSessionSecret) {
    console.error("Owner login: required environment variables are missing.");
    return errorResponse("Сервис временно недоступен.", 503);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("Некорректный запрос.", 400);
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("password" in body) ||
    typeof body.password !== "string" ||
    body.password.length === 0 ||
    body.password.length > 1024
  ) {
    return errorResponse("Введите пароль.", 400);
  }

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json",
  };

  try {
    const tokenHash = createHash("sha256")
      .update(sessionToken)
      .digest("hex");

    const sessionUrl = new URL(`${supabaseUrl}/rest/v1/user_sessions`);
    sessionUrl.searchParams.set("select", "user_id");
    sessionUrl.searchParams.set("token_hash", `eq.${tokenHash}`);
    sessionUrl.searchParams.set(
      "expires_at",
      `gt.${new Date().toISOString()}`
    );
    sessionUrl.searchParams.set("limit", "1");

    const sessionResponse = await fetch(sessionUrl, {
      headers,
      cache: "no-store",
    });

    if (!sessionResponse.ok) {
      console.error("Owner login: session lookup failed:", sessionResponse.status);
      return errorResponse("Не удалось проверить авторизацию.", 503);
    }

    const sessions = await sessionResponse.json();

    if (!Array.isArray(sessions) || sessions.length === 0) {
      return errorResponse("Сессия истекла. Войдите по телефону повторно.", 401);
    }

    const userId = sessions[0].user_id;

    const userUrl = new URL(`${supabaseUrl}/rest/v1/users`);
    userUrl.searchParams.set("select", "id,role");
    userUrl.searchParams.set("id", `eq.${userId}`);
    userUrl.searchParams.set("limit", "1");

    const userResponse = await fetch(userUrl, {
      headers,
      cache: "no-store",
    });

    if (!userResponse.ok) {
      console.error("Owner login: user lookup failed:", userResponse.status);
      return errorResponse("Не удалось проверить права пользователя.", 503);
    }

    const users = await userResponse.json();

    if (!Array.isArray(users) || users.length === 0 || users[0].role !== "owner") {
      return errorResponse("Недостаточно прав для доступа.", 403);
    }

    // Пароль проверяется на сервере. Результат проверки
    // передаётся в одну атомарную SQL-функцию.
    const passwordValid = safeEqual(body.password, ownerPassword);

    const attemptResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/owner_login_attempt`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_user_id: userId,
          p_password_valid: passwordValid,
        }),
        cache: "no-store",
      }
    );

    if (!attemptResponse.ok) {
      console.error("Owner login: atomic attempt failed:", attemptResponse.status);
      return errorResponse("Не удалось проверить пароль. Попробуйте позже.", 503);
    }

    const attempts = await attemptResponse.json();
    const attempt = Array.isArray(attempts) ? attempts[0] : null;

    if (
      !attempt ||
      typeof attempt.allowed !== "boolean" ||
      typeof attempt.authenticated !== "boolean"
    ) {
      console.error("Owner login: unexpected atomic attempt response.");
      return errorResponse("Не удалось проверить пароль.", 503);
    }

    if (!attempt.allowed) {
      const retryAfter = Math.max(
        1,
        Number(attempt.retry_after_seconds) || 900
      );

      const response = errorResponse(
        `Слишком много попыток. Повторите через ${Math.ceil(retryAfter / 60)} мин.`,
        429
      );

      response.headers.set("Retry-After", String(retryAfter));
      return response;
    }

    if (!attempt.authenticated) {
      return errorResponse("Неверный пароль.", 401);
    }

    const expiresAt = Math.floor(Date.now() / 1000) + OWNER_SESSION_SECONDS;

    const payload = Buffer.from(
      JSON.stringify({
        sub: userId,
        role: "owner",
        exp: expiresAt,
      })
    ).toString("base64url");

    const signature = signOwnerSession(payload, ownerSessionSecret);
    const ownerToken = `${payload}.${signature}`;

    const response = NextResponse.json(
      {
        success: true,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );

    response.cookies.set(OWNER_COOKIE, ownerToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: OWNER_SESSION_SECONDS,
    });

    return response;
  } catch (error) {
    console.error("Owner login error:", error);
    return errorResponse("Не удалось выполнить вход.", 503);
  }
}
