"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Profile = {
  id: string;
  phone: string;
  role: "owner" | "staff" | "customer";
  createdAt: string;
};

type Screen =
  | "loading"
  | "login-required"
  | "forbidden"
  | "password"
  | "checking"
  | "dashboard"
  | "staff-dashboard"
  | "error";

const dashboardItems: {
  title: string;
  description: string;
  href: string | null;
  available: boolean;
}[] = [
  {
    title: "Бронирования",
    description: "Просмотр, поиск и отмена временных резервов",
    href: "/admin/bookings",
    available: true,
  },
  {
    title: "Расписание",
    description: "Рабочие часы и исключения в расписании",
    href: "/admin/schedule",
    available: true,
  },
  {
    title: "Цены",
    description: "Тарифы и стоимость игровых слотов",
    href: "/admin/prices",
    available: true,
  },
  {
    title: "Города и клубы",
    description: "Управление клубами и их параметрами",
    href: "/admin/locations",
    available: true,
  },
  {
    title: "Настройки бронирования",
    description: "Длительности, шаг слотов и время удержания",
    href: "/admin/booking-settings",
    available: true,
  },
  {
    title: "Клиенты",
    description: "Профили и история посещений",
    href: null,
    available: false,
  },
  {
    title: "Оплаты",
    description: "Статусы и история платежей",
    href: null,
    available: false,
  },
  {
    title: "Оборудование",
    description: "Состояние контроллеров и управление доступом",
    href: null,
    available: false,
  },
];

export default function AdminPage() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      try {
        const profileResponse = await fetch("/api/account/profile", {
          cache: "no-store",
          credentials: "same-origin",
        });

        if (profileResponse.status === 401) {
          if (!cancelled) setScreen("login-required");
          return;
        }

        if (!profileResponse.ok) {
          throw new Error("Не удалось проверить профиль.");
        }

        const profileData = await profileResponse.json();
        const currentProfile = profileData.profile as
          | Profile
          | undefined;

        if (!currentProfile) {
          throw new Error("Профиль не найден.");
        }

        if (cancelled) return;

        setProfile(currentProfile);

        if (currentProfile.role === "staff") {
          setScreen("staff-dashboard");
          return;
        }

        if (currentProfile.role !== "owner") {
          setScreen("forbidden");
          return;
        }

        const statusResponse = await fetch(
          "/api/admin/owner-status",
          {
            cache: "no-store",
            credentials: "same-origin",
          },
        );

        if (cancelled) return;

        if (statusResponse.ok) {
          setScreen("dashboard");
          return;
        }

        if (statusResponse.status === 401) {
          setScreen("password");
          return;
        }

        throw new Error(
          "Не удалось проверить доступ владельца.",
        );
      } catch {
        if (!cancelled) {
          setMessage(
            "Не удалось связаться с сервером. Попробуйте обновить страницу.",
          );
          setScreen("error");
        }
      }
    }

    void checkAccess();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePasswordSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!password || submitting) return;

    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/owner-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(
          typeof data.error === "string"
            ? data.error
            : "Не удалось выполнить вход.",
        );
        return;
      }

      const statusResponse = await fetch(
        "/api/admin/owner-status",
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      );

      if (!statusResponse.ok) {
        setMessage(
          "Пароль принят, но подтвердить доступ не удалось. Обновите страницу.",
        );
        return;
      }

      setPassword("");
      setScreen("dashboard");
    } catch {
      setMessage("Ошибка соединения. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderPanel(
    title: string,
    description: string,
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0914] px-5 py-12 text-white">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#151121] p-7 shadow-2xl sm:p-9">
          <Link
            href="/"
            className="text-sm font-semibold tracking-[0.22em] text-violet-300"
          >
            PONGLAB
          </Link>

          <h1 className="mt-7 text-2xl font-semibold">
            {title}
          </h1>

          <p className="mt-3 text-sm leading-6 text-white/65">
            {description}
          </p>

          {message && (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200"
            >
              {message}
            </p>
          )}

          <Link
            href="/"
            className="mt-7 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#151121] transition hover:bg-violet-100"
          >
            Вернуться на сайт
          </Link>
        </section>
      </main>
    );
  }

  if (screen === "loading" || screen === "checking") {
    return renderPanel(
      "Проверяем доступ",
      "Проверяем сессию и права пользователя. Это может занять несколько секунд.",
    );
  }

  if (screen === "login-required") {
    return renderPanel(
      "Войдите в аккаунт",
      "Сначала откройте личный кабинет на главной странице и подтвердите свой номер телефона. Затем вернитесь сюда.",
    );
  }

  if (screen === "forbidden") {
    return renderPanel(
      "Нет доступа",
      "Эта страница доступна только владельцу и назначенным сотрудникам.",
    );
  }

  if (screen === "error") {
    return renderPanel(
      "Ошибка проверки",
      message || "Не удалось проверить доступ.",
    );
  }

  if (screen === "password") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0914] px-5 py-12 text-white">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#151121] p-7 shadow-2xl sm:p-9">
          <Link
            href="/"
            className="text-sm font-semibold tracking-[0.22em] text-violet-300"
          >
            PONGLAB
          </Link>

          <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-400/10 text-xl text-violet-200">
            ◈
          </div>

          <h1 className="mt-6 text-2xl font-semibold">
            Панель владельца
          </h1>

          <p className="mt-3 text-sm leading-6 text-white/65">
            Номер подтверждён. Введите дополнительный пароль для
            получения доступа к управлению студией.
          </p>

          {profile && (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs text-white/45">
                Вы вошли как
              </p>
              <p className="mt-1 text-sm font-medium">
                {profile.phone}
              </p>
            </div>
          )}

          <form
            onSubmit={handlePasswordSubmit}
            className="mt-6 space-y-4"
          >
            <label
              htmlFor="owner-password"
              className="block text-sm text-white/80"
            >
              Пароль владельца
            </label>

            <input
              id="owner-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              required
              maxLength={1024}
              disabled={submitting}
              className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3.5 text-white outline-none transition placeholder:text-white/30 focus:border-violet-400 disabled:opacity-60"
              placeholder="Введите пароль"
            />

            {message && (
              <p
                role="alert"
                className="text-sm leading-5 text-red-300"
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !password}
              className="w-full rounded-xl bg-violet-500 px-5 py-3.5 font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Проверяем…" : "Войти в панель"}
            </button>
          </form>

          <Link
            href="/"
            className="mt-5 inline-block text-sm text-white/50 transition hover:text-white"
          >
            Вернуться на сайт
          </Link>
        </section>
      </main>
    );
  }

  if (screen === "staff-dashboard") {
    return (
      <main className="min-h-screen bg-[#0b0914] px-5 py-8 text-white sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <Link
              href="/"
              className="text-sm font-semibold tracking-[0.22em] text-violet-300"
            >
              PONGLAB
            </Link>

            <h1 className="mt-3 text-2xl font-semibold">
              Панель сотрудника
            </h1>

            <p className="mt-1 text-sm text-white/50">
              {profile
                ? `Аккаунт: ${profile.phone}`
                : "Доступ сотрудника"}
            </p>
          </div>

          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs text-emerald-200">
            Телефон подтверждён
          </span>
        </header>

        <section className="mt-8 max-w-3xl">
          <h2 className="text-lg font-semibold">
            Рабочая панель
          </h2>

          <p className="mt-2 text-sm leading-6 text-white/60">
            Вы вошли как сотрудник. Доступ к клубам и рабочим
            операциям будет ограничен назначенными вам клубами.
            Финансовые данные владельца здесь не отображаются.
          </p>

          <div className="mt-6 rounded-2xl border border-white/10 bg-[#151121] p-5">
            <h3 className="font-semibold">
              Рабочие функции
            </h3>

            <p className="mt-2 text-sm leading-6 text-white/55">
              Раздел бронирований, расписание и управление
              посещениями пока не подключены. До подключения
              серверных проверок этот экран не предоставляет
              операций изменения данных.
            </p>
          </div>

          <Link
            href="/"
            className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#151121] transition hover:bg-violet-100"
          >
            Вернуться на сайт
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b0914] px-5 py-8 text-white sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <Link
            href="/"
            className="text-sm font-semibold tracking-[0.22em] text-violet-300"
          >
            PONGLAB
          </Link>

          <h1 className="mt-3 text-2xl font-semibold">
            Панель управления
          </h1>

          <p className="mt-1 text-sm text-white/50">
            Владелец студии
          </p>
        </div>

        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs text-emerald-200">
          Доступ подтверждён
        </span>
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">
          Управление PongLab
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
          Здесь собраны основные настройки и рабочие разделы
          управления студией.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {dashboardItems.map((item) => {
            const cardContent = (
              <>
                <h3 className="font-semibold">
                  {item.title}
                </h3>

                <p className="mt-2 text-sm leading-6 text-white/55">
                  {item.description}
                </p>

                <span
                  className={
                    item.available
                      ? "mt-4 inline-block text-xs text-violet-300"
                      : "mt-4 inline-block text-xs text-white/35"
                  }
                >
                  {item.available
                    ? "Открыть раздел →"
                    : "Подключим следующим этапом"}
                </span>
              </>
            );

            if (item.available && item.href) {
              return (
                <Link
                  key={item.title}
                  href={item.href}
                  className="group rounded-2xl border border-white/10 bg-[#151121] p-5 transition hover:border-violet-300/30 hover:bg-[#1a1527]"
                >
                  {cardContent}
                </Link>
              );
            }

            return (
              <article
                key={item.title}
                className="rounded-2xl border border-white/10 bg-[#151121] p-5"
              >
                {cardContent}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
