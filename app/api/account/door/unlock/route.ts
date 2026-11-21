
import { NextRequest, NextResponse } from "next/server";
import {
  isUuid,
  resolveSessionUserId,
} from "@/lib/yookassa";
import {
  DoorAccessError,
  doorAccessErrorResponse,
  requestBookingDoorAccess,
} from "@/lib/account-door-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: NextRequest) {
  // Запрещаем запросы с посторонних сайтов.
  const origin = request.headers.get("origin");

  if (!origin || origin !== new URL(request.url).origin) {
    return errorResponse("Недопустимый запрос.", 403);
  }

  // Проверяем тело запроса.
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("Некорректный запрос.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Некорректный запрос.", 400);
  }

  const data = body as Record<string, unknown>;
  const bookingId = data.booking_id;

  if (!isUuid(bookingId)) {
    return errorResponse(
      "Укажите корректное бронирование.",
      400,
    );
  }

  // Проверяем формат пользовательской сессии.
  const sessionToken =
    request.cookies.get("ponglab_session")?.value;

  if (!sessionToken || !/^[a-f0-9]{64}$/i.test(sessionToken)) {
    return errorResponse(
      "Войдите в личный кабинет.",
      401,
    );
  }

  // Сохраняем прежнюю проверку наличия конфигурации Supabase.
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SECRET_KEY
  ) {
    return errorResponse(
      "Сервис временно недоступен.",
      503,
    );
  }

  try {
    // Пользователь определяется только по проверенной сессии.
    const userId = await resolveSessionUserId(sessionToken);

    if (!userId) {
      const response = NextResponse.json(
        { error: "Сессия истекла. Войдите повторно." },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        },
      );

      response.cookies.set("ponglab_session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });

      return response;
    }

    // Общая проверка прав и создание команды открытия.
    const result = await requestBookingDoorAccess({
      userId,
      bookingId,
      requestChannel: "web",
    });

    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof DoorAccessError) {
      return doorAccessErrorResponse(error);
    }

    console.error("Door unlock request error:", error);

    return errorResponse(
      "Не удалось обработать запрос на открытие двери.",
      503,
    );
  }
}
