
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

export const runtime = "nodejs";

function privateJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get("ponglab_session")?.value;

  const response = privateJson({ success: true });

  // Очищаем cookie в браузере
  const clearSessionCookie = () => {
    response.cookies.set("ponglab_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  };

  if (!sessionToken || !/^[a-f0-9]{64}$/i.test(sessionToken)) {
    clearSessionCookie();
    return response;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    clearSessionCookie();
    return privateJson(
      { error: "Не настроены переменные Supabase." },
      { status: 500 },
    );
  }

  const tokenHash = createHash("sha256")
    .update(sessionToken)
    .digest("hex");

  try {
    const supabaseResponse = await fetch(
      `${supabaseUrl}/rest/v1/user_sessions?token_hash=eq.${tokenHash}`,
      {
        method: "DELETE",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Prefer: "return=minimal",
        },
        cache: "no-store",
      },
    );

    // Даже если удаление на сервере не удалось,
    // не оставляем токен авторизации в браузере.
    clearSessionCookie();

    if (!supabaseResponse.ok) {
      console.error(
        "Logout session deletion failed:",
        supabaseResponse.status,
      );

      return privateJson(
        { error: "Не удалось завершить серверную сессию." },
        { status: 503 },
      );
    }

    return response;
  } catch {
    console.error("Logout request failed.");
    clearSessionCookie();

    return privateJson(
      { error: "Ошибка при завершении сессии." },
      { status: 503 },
    );
  }
}
