
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

function logMaxConnectionError(error: unknown) {
  const diagnostics: Array<Record<string, string>> = [];
  let current: unknown = error;

  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (!(current instanceof Error)) {
      diagnostics.push({
        value: String(current).slice(0, 300),
      });
      break;
    }

    const item: Record<string, string> = {
      name: current.name,
      message: current.message.slice(0, 500),
    };

    const code = (current as Error & { code?: unknown }).code;

    if (typeof code === "string") {
      item.code = code;
    }

    diagnostics.push(item);

    current = (current as Error & { cause?: unknown }).cause;
  }

  console.error("MAX connection diagnostics:", diagnostics);
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
      console.error("MAX API returned HTTP status:", error.status);

      return json(
        {
          ok: false,
          error: "MAX не принял запрос проверки бота.",
          max_status: error.status,
        },
        502,
      );
    }

    logMaxConnectionError(error);

    return json(
      {
        ok: false,
        error: "Не удалось проверить подключение MAX.",
      },
      503,
    );
  }
}
