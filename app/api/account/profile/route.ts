
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get("ponglab_session")?.value;

  if (!sessionToken || !/^[a-f0-9]{64}$/i.test(sessionToken)) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401 }
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Profile API: Supabase environment variables are missing.");

    return NextResponse.json(
      { error: "Сервис временно недоступен." },
      { status: 500 }
    );
  }

  const tokenHash = createHash("sha256")
    .update(sessionToken)
    .digest("hex");

  try {
    // Проверяем сессию на сервере и получаем ID пользователя.
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
        "Profile API: Session lookup failed:",
        sessionResponse.status
      );

      return NextResponse.json(
        { error: "Не удалось проверить авторизацию." },
        { status: 503 }
      );
    }

    const sessions = await sessionResponse.json();

    if (!Array.isArray(sessions) || sessions.length === 0) {
      const response = NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );

      response.cookies.set("ponglab_session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });

      return response;
    }

    const userId = sessions[0].user_id;

    // Получаем профиль только для пользователя из действующей сессии.
    const userResponse = await fetch(
      `${supabaseUrl}/rest/v1/users?select=id,phone,created_at&id=eq.${encodeURIComponent(
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
        "Profile API: User lookup failed:",
        userResponse.status
      );

      return NextResponse.json(
        { error: "Не удалось загрузить профиль." },
        { status: 503 }
      );
    }

    const users = await userResponse.json();

    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json(
        { error: "Профиль пользователя не найден." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
        profile: {
          id: users[0].id,
          phone: users[0].phone,
          createdAt: users[0].created_at,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Profile API error:", error);

    return NextResponse.json(
      { error: "Ошибка при загрузке профиля." },
      { status: 503 }
    );
  }
}
