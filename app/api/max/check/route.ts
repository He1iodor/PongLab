
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/app/lib/owner-auth";
import { getMaxBotInfo, MaxApiError } from "@/lib/max/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const access = await requireOwner(request);

  if (!access.ok) {
    return access.response;
  }

  try {
    const bot = await getMaxBotInfo();

    return json({
      ok: true,
      bot: {
        user_id: bot.user_id,
        first_name: bot.first_name,
        username: bot.username ?? null,
        is_bot: bot.is_bot,
      },
    });
  } catch (error) {
    if (error instanceof MaxApiError) {
      console.error("MAX bot check failed:", error.status);

      return json(
        {
          ok: false,
          error: "MAX не принял запрос проверки бота.",
          max_status: error.status,
        },
        502,
      );
    }

    console.error(
      "MAX bot check failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return json(
      {
        ok: false,
        error: "Не удалось проверить подключение MAX.",
      },
      503,
    );
  }
}
