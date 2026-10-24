
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get("ponglab_session")?.value;

  const response = NextResponse.json({ success: true });

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
    return NextResponse.json(
      { error: "Не настроены переменные Supabase." },
      { status: 500 }
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
      }
    );

    // Даже если удаление на сервере не удалось,
    // не оставляем токен авторизации в браузере.
    clearSessionCookie();

    if (!supabaseResponse.ok) {
      console.error(
        "Logout session deletion failed:",
        supabaseResponse.status,
        await supabaseResponse.text()
      );

      return NextResponse.json(
        { error: "Не удалось завершить серверную сессию." },
        { status: 503 }
      );
    }

    return response;
  } catch (error) {
    console.error("Logout request failed:", error);
    clearSessionCookie();

    return NextResponse.json(
      { error: "Ошибка при завершении сессии." },
      { status: 503 }
    );
  }
}
