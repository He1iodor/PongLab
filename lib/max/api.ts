
import "server-only";

const MAX_API_BASE_URL = "https://platform-api2.max.ru";
const MAX_API_TIMEOUT_MS = 8_000;

export type MaxBotInfo = {
  user_id: number;
  first_name: string;
  username?: string | null;
  is_bot: true;
  last_activity_time?: number;
  description?: string | null;
};

export class MaxApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`MAX API request failed with HTTP ${status}.`);
    this.name = "MaxApiError";
    this.status = status;
  }
}

function getMaxBotToken(): string {
  const token = process.env.MAX_BOT_TOKEN?.trim();

  if (!token) {
    throw new Error("MAX_BOT_TOKEN is not configured.");
  }

  return token;
}

/**
 * Server-side MAX Bot API client.
 *
 * The access token is sent only in the Authorization header.
 * Do not call this module from client components or expose API errors
 * containing request headers or credentials to users.
 */
export async function maxApiRequest<T>(
  path: `/${string}`,
  init: RequestInit = {},
): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("MAX API path must be an absolute API path.");
  }

  const token = getMaxBotToken();
  const headers = new Headers(init.headers);

  headers.set("Authorization", token);
  headers.set("Accept", "application/json");

  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${MAX_API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(MAX_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new MaxApiError(response.status);
  }

  return (await response.json()) as T;
}

/**
 * Verifies that MAX_BOT_TOKEN is valid and belongs to a bot.
 */
export async function getMaxBotInfo(): Promise<MaxBotInfo> {
  const result = await maxApiRequest<MaxBotInfo>("/me");

  if (
    !result ||
    typeof result.user_id !== "number" ||
    !Number.isSafeInteger(result.user_id) ||
    typeof result.first_name !== "string" ||
    result.is_bot !== true
  ) {
    throw new Error("MAX API returned an invalid bot profile.");
  }

  return result;
}
