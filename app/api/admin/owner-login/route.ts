
import { NextRequest, NextResponse } from "next/server";
import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "ponglab_session";
const OWNER_COOKIE = "ponglab_owner";
const OWNER_SESSION_SECONDS = 30 * 60;

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

function signOwnerSession(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

export async function POST(request: NextRequest) {
  // Принимаем запрос только с того же origin.
  const origin = request.headers.get("origin");

  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json(
      { error: "Недопустимый запрос." },
      { status: 403 }
    );
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;

  if (!sessionToken || !/^[a-f0-9]{64}$/i.test(sessionToken)) {
    return NextResponse.json(
      { error: "Сначала войдите по номеру телефона." },
      { status: 401 }
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const ownerPassword = process.env.OWNER_PASSWORD;
  const ownerSessionSecret = process.env.OWNER_SESSION_SECRET;

  if (
    !supabaseUrl ||
    !supabaseKey ||
    !ownerPassword ||
    !ownerSessionSecret
  ) {
    console.error("Owner login: required environment variables are missing.");

    return NextResponse.json(
      { error: "Сервис временно недоступен." },
      { status: 503 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Некорректный запрос." },
      { status: 400 }
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("password" in body) ||
    typeof body.password !== "string" ||
    body.password.length === 0 ||
    body.password.length > 1024
  ) {
    return NextResponse.json(
      { error: "Введите пароль." },
      { status: 400 }
    );
  }

  const tokenHash = createHash("sha256")
    .update(sessionToken)
    .digest("hex");

  try {
    const sessionResponse = await fetch(
      `${supabaseUrl}/rest/v1/user_sessions?select=user_id&token_hash=eq.${tokenHash}&expires_at=gt.${encodeURIComponent(
        new Date().toISOString()
      )}&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: "no-store",
      }
    );

    if (!sessionResponse.ok) {
      console.error(
        "Owner login: session lookup failed:",
        sessionResponse.status
      );

      return NextResponse.json(
        { error: "Не удалось проверить авторизацию." },
        { status: 503 }
      );
    }

    const sessions = await sessionResponse.json();

    if (!Array.isArray(sessions) || sessions.length === 0) {
      return NextResponse.json(
        { error: "Сессия истекла. Войдите по телефону повторно." },
        { status: 401 }
      );
    }

    const userId = sessions[0].user_id;

    const userResponse = await fetch(
      `${supabaseUrl}/rest/v1/users?select=id,role&id=eq.${encodeURIComponent(
        userId
      )}&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: "no-store",
      }
    );

    if (!userResponse.ok) {
      console.error(
        "Owner login: user lookup failed:",
        userResponse.status
      );

      return NextResponse.json(
        { error: "Не удалось проверить права пользователя." },
        { status: 503 }
      );
    }

    const users = await userResponse.json();

    if (
      !Array.isArray(users) ||
      users.length === 0 ||
      users[0].role !== "owner"
    ) {
      return NextResponse.json(
        { error: "Недостаточно прав для доступа." },
        { status: 403 }
      );
    }

    if (!safeEqual(body.password, ownerPassword)) {
      return NextResponse.json(
        { error: "Неверный пароль." },
        { status: 401 }
      );
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
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
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

    return NextResponse.json(
      { error: "Не удалось выполнить вход." },
      { status: 503 }
    );
  }
}

