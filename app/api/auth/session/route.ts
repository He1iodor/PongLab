
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

export const runtime = "nodejs";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function dbRequest(path: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are missing");
  }

  return fetch(`${url}/rest/v1/${path}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const sessionToken =
      request.cookies.get("ponglab_session")?.value;

    if (!sessionToken || !/^[0-9a-f]{64}$/i.test(sessionToken)) {
      return NextResponse.json({ authenticated: false });
    }

    const tokenHash = hashToken(sessionToken);

    const query = new URLSearchParams({
      select: "user_id,expires_at",
      token_hash: `eq.${tokenHash}`,
      expires_at: `gt.${new Date().toISOString()}`,
      limit: "1",
    });

    const dbResponse = await dbRequest(
      `user_sessions?${query.toString()}`,
    );

    if (!dbResponse.ok) {
      console.error(
        "Session lookup failed:",
        await dbResponse.text(),
      );

      return NextResponse.json(
        { error: "Не удалось проверить сессию." },
        { status: 503 },
      );
    }

    const rows = await dbResponse.json();
    const session = rows[0];

    if (!session?.user_id) {
      const response = NextResponse.json({
        authenticated: false,
      });

      response.cookies.set("ponglab_session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: new Date(0),
      });

      return response;
    }

    return NextResponse.json({
      authenticated: true,
    });
  } catch (error) {
    console.error("Session verification failed:", error);

    return NextResponse.json(
      { error: "Временная ошибка сервера." },
      { status: 500 },
    );
  }
}
