
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get("ponglab_session")?.value;

  if (!sessionToken || !/^[a-f0-9]{64}$/i.test(sessionToken)) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Profile API: Supabase environment variables are missing.");

    return NextResponse.json(
      { error: "Сервис временно недоступен." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const tokenHash = createHash("sha256")
    .update(sessionToken)
    .digest("hex");

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  };

  try {
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
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );

      response.cookies.set("ponglab_session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });

      response.cookies.set("ponglab_owner", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 0,
      });

      return response;
    }

    const userId = sessions[0].user_id;

    const userUrl = new URL(`${supabaseUrl}/rest/v1/users`);
    userUrl.searchParams.set("select", "id,phone,role,created_at");
    userUrl.searchParams.set("id", `eq.${userId}`);
    userUrl.searchParams.set("limit", "1");

    const userResponse = await fetch(userUrl, {
      headers,
      cache: "no-store",
    });

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
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const user = users[0];

    return NextResponse.json(
      {
        authenticated: true,
        profile: {
          id: user.id,
          phone: user.phone,
          role: user.role,
          createdAt: user.created_at,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Profile API error:", error);

    return NextResponse.json(
      { error: "Ошибка при загрузке профиля." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
