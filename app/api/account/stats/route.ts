import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTokenFromRequest,
  resolveSessionUserId,
} from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const token = getSessionTokenFromRequest(request);
  if (!token) return noStoreJson({ error: "Войдите в личный кабинет." }, 401);

  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return noStoreJson({ error: "Сервис временно недоступен." }, 503);

  try {
    const userId = await resolveSessionUserId(token);
    if (!userId) return noStoreJson({ error: "Сессия истекла." }, 401);

    const response = await fetch(`${url}/rest/v1/rpc/get_account_stats`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_user_id: userId }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error("Account stats RPC failed:", response.status);
      return noStoreJson({ error: "Не удалось загрузить статистику." }, 503);
    }

    const stats: unknown = await response.json();
    if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
      return noStoreJson({ error: "Получен некорректный ответ статистики." }, 503);
    }

    return noStoreJson({ stats });
  } catch (error) {
    console.error("Account stats GET error:", error);
    return noStoreJson({ error: "Ошибка при загрузке статистики." }, 503);
  }
}
