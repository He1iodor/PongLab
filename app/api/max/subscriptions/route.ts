
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/app/lib/owner-auth";
import { maxApiRequest, MaxApiError } from "@/lib/max/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_BASE_URL =
  "https://ponglab-git-feature-heliodor-s-projects.vercel.app/api/max/webhook";

const UPDATE_TYPES = ["bot_started", "bot_stopped"] as const;

type MaxSubscription = {
  url?: unknown;
  time?: unknown;
  update_types?: unknown;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getWebhookSecret(): string | null {
  const secret = process.env.MAX_WEBHOOK_SECRET?.trim();

  if (
    !secret ||
    secret.length < 5 ||
    secret.length > 256 ||
    !/^[A-Za-z0-9_-]+$/.test(secret)
  ) {
    return null;
  }

  return secret;
}

function getAutomationBypassSecret(): string | null {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

  if (!secret || secret.length < 16 || secret.length > 512) {
    return null;
  }

  return secret;
}

function getDisplayWebhookUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);

    if (url.protocol !== "https:") return null;

    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

function buildWebhookDeliveryUrl(bypassSecret: string): string {
  const url = new URL(WEBHOOK_BASE_URL);
  url.searchParams.set("x-vercel-protection-bypass", bypassSecret);
  return url.toString();
}

function maxApiFailure(result: unknown) {
  if (!isRecord(result) || result.success !== false) return null;

  return {
    success: false,
    code: typeof result.code === "string"
      ? result.code.slice(0, 100)
      : undefined,
    message: typeof result.message === "string"
      ? result.message.slice(0, 300)
      : undefined,
  };
}

function logApiError(error: unknown) {
  if (error instanceof MaxApiError) {
    console.error("MAX subscriptions API HTTP status:", error.status);
    return;
  }

  console.error(
    "MAX subscriptions API failed:",
    error instanceof Error ? error.message.slice(0, 300) : "Unknown error",
  );
}

export async function GET(request: NextRequest) {
  const access = await requireOwner(request);

  if (!access.ok) return access.response;

  try {
    const result: unknown = await maxApiRequest("/subscriptions");
    const failure = maxApiFailure(result);

    if (failure) {
      return json({ ok: false, error: failure }, 502);
    }

    if (!isRecord(result) || !Array.isArray(result.subscriptions)) {
      return json(
        { ok: false, error: "MAX вернул неожиданный формат списка подписок." },
        502,
      );
    }

    const subscriptions = (result.subscriptions as MaxSubscription[]).map(
      (item) => ({
        url: getDisplayWebhookUrl(item.url),
        time: typeof item.time === "number" ? item.time : null,
        update_types: Array.isArray(item.update_types)
          ? item.update_types.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
      }),
    );

    return json({ ok: true, subscriptions });
  } catch (error) {
    logApiError(error);
    return json(
      { ok: false, error: "Не удалось получить подписки MAX." },
      502,
    );
  }
}

export async function POST(request: NextRequest) {
  const access = await requireOwner(request);

  if (!access.ok) return access.response;

  const secret = getWebhookSecret();

  if (!secret) {
    return json(
      {
        ok: false,
        error: "MAX_WEBHOOK_SECRET отсутствует или имеет недопустимый формат.",
      },
      503,
    );
  }

  const bypassSecret = getAutomationBypassSecret();

  if (!bypassSecret) {
    return json(
      {
        ok: false,
        error:
          "VERCEL_AUTOMATION_BYPASS_SECRET отсутствует или недопустим для Preview.",
      },
      503,
    );
  }

  try {
    const deliveryUrl = buildWebhookDeliveryUrl(bypassSecret);

    const result: unknown = await maxApiRequest("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        url: deliveryUrl,
        update_types: [...UPDATE_TYPES],
        secret,
      }),
    });

    const failure = maxApiFailure(result);

    if (failure) {
      return json({ ok: false, error: failure }, 502);
    }

    if (!isRecord(result) || result.success !== true) {
      return json(
        { ok: false, error: "MAX не подтвердил создание подписки." },
        502,
      );
    }

    return json({
      ok: true,
      message: "Подписка MAX зарегистрирована.",
      url: WEBHOOK_BASE_URL,
      update_types: [...UPDATE_TYPES],
    });
  } catch (error) {
    logApiError(error);
    return json(
      { ok: false, error: "Не удалось зарегистрировать webhook MAX." },
      502,
    );
  }
}
