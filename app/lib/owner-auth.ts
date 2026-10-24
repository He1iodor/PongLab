
import { NextRequest, NextResponse } from "next/server";
import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export const runtime = "nodejs";

type OwnerAccess =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

function deny(status: number, message: string): OwnerAccess {
  return {
    ok: false,
    response: NextResponse.json(
      { error: message },
      {
        status,
        headers: { "Cache-Control": "no-store" },
      }
    ),
  };
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  return (
    left.length === right.length &&
    timingSafeEqual(left, right)
  );
}

export async function requireOwner(
  request: NextRequest
): Promise<OwnerAccess> {
  const sessionToken = request.cookies.get("ponglab_session")?.value;
  const ownerToken = request.cookies.get("ponglab_owner")?.value;

  if (
    !sessionToken ||
    !/^[a-f0-9]{64}$/i.test(sessionToken) ||
    !ownerToken
  ) {
    return deny(401, "Требуется авторизация владельца.");
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const secret = process.env.OWNER_SESSION_SECRET;

  if (!supabaseUrl || !supabaseKey || !secret) {
    console.error("Owner auth: required environment variables are missing.");
    return deny(503, "Сервис временно недоступен.");
  }

  // Проверяем подпись cookie владельца.
  const parts = ownerToken.split(".");

  if (parts.length !== 2) {
    return deny(401, "Сессия владельца недействительна.");
  }

  const [payload, signature] = parts;
  const expectedSignature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  if (
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !safeEqual(signature, expectedSignature)
  ) {
    return deny(401, "Сессия владельца недействительна.");
  }

  let claims: { sub?: unknown; role?: unknown; exp?: unknown };

  try {
    claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
  } catch {
    return deny(401, "Сессия владельца недействительна.");
  }

  if (
    typeof claims.sub !== "string" ||
    claims.role !== "owner" ||
    typeof claims.exp !== "number" ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp <= Math.floor(Date.now() / 1000)
  ) {
    return deny(401, "Сессия владельца истекла.");
  }

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  };

  try {
    // Повторно проверяем действительность основной сессии.
    const tokenHash = createHash("sha256")
      .update(sessionToken)
      .digest("hex");

    const sessionUrl = new URL(
      `${supabaseUrl}/rest/v1/user_sessions`
    );
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
        "Owner auth: session lookup failed:",
        sessionResponse.status
      );
      return deny(503, "Не удалось проверить сессию.");
    }

    const sessions = await sessionResponse.json();

    if (
      !Array.isArray(sessions) ||
      sessions.length === 0 ||
      sessions[0].user_id !== claims.sub
    ) {
      return deny(401, "Основная сессия недействительна.");
    }

    // Проверяем роль по базе при каждом защищённом запросе.
    const userUrl = new URL(`${supabaseUrl}/rest/v1/users`);
    userUrl.searchParams.set("select", "id,role");
    userUrl.searchParams.set("id", `eq.${claims.sub}`);
    userUrl.searchParams.set("limit", "1");

    const userResponse = await fetch(userUrl, {
      headers,
      cache: "no-store",
    });

    if (!userResponse.ok) {
      console.error(
        "Owner auth: role lookup failed:",
        userResponse.status
      );
      return deny(503, "Не удалось проверить права.");
    }

    const users = await userResponse.json();

    if (
      !Array.isArray(users) ||
      users.length === 0 ||
      users[0].role !== "owner"
    ) {
      return deny(403, "Недостаточно прав.");
    }

    return { ok: true, userId: claims.sub };
  } catch (error) {
    console.error("Owner auth error:", error);
    return deny(503, "Ошибка проверки доступа.");
  }
}
