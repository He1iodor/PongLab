
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import {
  Activity,
  Bell,
  CalendarDays,
  CalendarPlus,
  LogOut,
  RefreshCw,
  UserRound,
} from "lucide-react";

import AccountBookingsPanel from "@/components/AccountBookingsPanel";
import BookingExtensionOffers from "@/components/BookingExtensionOffers";
import AccountProfilePanel from "@/components/AccountProfilePanel";
import AccountStatsPanel from "@/components/AccountStatsPanel";
import AccountNotificationsPanel from "@/components/AccountNotificationsPanel";
import BookingCalendar from "@/components/BookingCalendar";

type MaxWebApp = {
  initData: string;
};

declare global {
  interface Window {
    WebApp?: MaxWebApp;
  }
}

type Tab =
  | "bookings"
  | "new"
  | "profile"
  | "stats"
  | "notifications";

type AuthStatus =
  | "checking"
  | "ready"
  | "unlinked"
  | "unauthenticated"
  | "error";

const tabs: Array<{
  id: Tab;
  label: string;
  icon: typeof CalendarDays;
}> = [
  { id: "bookings", label: "Занятия", icon: CalendarDays },
  { id: "new", label: "Запись", icon: CalendarPlus },
  { id: "profile", label: "Профиль", icon: UserRound },
  { id: "stats", label: "Статистика", icon: Activity },
  { id: "notifications", label: "События", icon: Bell },
];

export default function MaxAppClient() {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [tab, setTab] = useState<Tab>("bookings");
  const [loggingOut, setLoggingOut] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const authStarted = useRef(false);

  // Восстанавливаем вкладку из адреса после возврата из оферты.
  useEffect(() => {
    const requestedTab = new URLSearchParams(
      window.location.search,
    ).get("tab");

    if (requestedTab && tabs.some((item) => item.id === requestedTab)) {
      setTab(requestedTab as Tab);
    }
  }, []);

  const authenticate = useCallback(async (initData: string) => {
    if (authStarted.current) return;

    authStarted.current = true;
    setStatus("checking");
    setError("");

    try {
      if (initData) {
        const response = await fetch("/api/max/miniapp/auth", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ initData }),
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          if (response.status === 403 && result.linked === false) {
            setStatus("unlinked");
            setError(
              result.error ||
                "MAX не привязан к аккаунту PongLab.",
            );
            return;
          }

          throw new Error(
            result.error || "Не удалось выполнить авторизацию.",
          );
        }

        if (result.authenticated !== true) {
          throw new Error("Сервер не подтвердил авторизацию.");
        }
      } else {
        const response = await fetch("/api/auth/session", {
          credentials: "same-origin",
          cache: "no-store",
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.authenticated !== true) {
          setStatus("unauthenticated");
          setError(
            "Для входа подтвердите номер телефона. После авторизации вы сможете вернуться в приложение MAX.",
          );
          return;
        }
      }

      const profileResponse = await fetch("/api/account/profile", {
        credentials: "same-origin",
        cache: "no-store",
      });

      const profileResult = await profileResponse.json().catch(() => ({}));

      if (!profileResponse.ok) {
        throw new Error(
          profileResult.error || "Не удалось загрузить профиль.",
        );
      }

      setFullName(profileResult.profile?.full_name || "");
      setStatus("ready");
    } catch (caught) {
      setStatus("error");
      setError(
        caught instanceof Error
          ? caught.message
          : "Ошибка авторизации.",
      );
    }
  }, []);

  const loadUnreadCount = useCallback(async () => {
    try {
      const response = await fetch("/api/account/notifications", {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) return;

      const result = await response.json().catch(() => ({}));
      setUnreadCount(Math.max(0, Number(result.unread_count) || 0));
    } catch {
      // Сохраняем последнее известное значение при временной ошибке сети.
    }
  }, []);

  useEffect(() => {
    if (status !== "ready") return;

    void loadUnreadCount();

    const timer = window.setInterval(
      () => void loadUnreadCount(),
      3000,
    );

    const refreshOnFocus = () => void loadUnreadCount();
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [status, loadUnreadCount]);

  const initializeMax = useCallback(() => {
    const webApp = window.WebApp;

    if (webApp) {
      // MAX передаёт исходную строку initData.
      // Проверка подлинности выполняется на сервере.
      void authenticate(webApp.initData || "");
      return;
    }

    // Если страница открыта не в MAX,
    // проверяем обычную сессию PongLab.
    void authenticate("");
  }, [authenticate]);

  useEffect(() => {
    if (window.WebApp) {
      initializeMax();
    }
  }, [initializeMax]);

  const logout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });

      window.location.assign("/");
    } catch {
      setError("Не удалось завершить сессию.");
      setLoggingOut(false);
    }
  };

  const retry = () => {
    authStarted.current = false;
    setStatus("checking");
    initializeMax();
  };

  return (
    <>
      <Script
        src="https://st.max.ru/js/max-web-app.js"
        strategy="afterInteractive"
        onReady={initializeMax}
      />

      <div
        className="min-h-screen bg-[#090B18] text-white"
        style={{
          paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))",
        }}
      >
        {status === "checking" && (
          <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#7540D8]/20 text-[#B99AFF]">
              <RefreshCw size={28} className="animate-spin" />
            </div>

            <h1 className="text-xl font-semibold">PongLab</h1>

            <p className="text-sm text-white/50">
              Проверяем авторизацию...
            </p>
          </div>
        )}

        {(status === "unlinked" ||
          status === "unauthenticated" ||
          status === "error") && (
          <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#7540D8]/20 text-[#B99AFF]">
              <UserRound size={28} />
            </div>

            <h1 className="mt-5 text-2xl font-semibold">
              {status === "unlinked"
                ? "MAX не подключён"
                : "Нет доступа к аккаунту"}
            </h1>

            <p className="mt-3 max-w-sm text-sm leading-6 text-white/55">
              {error}
            </p>

            {status === "error" && (
              <button
                onClick={retry}
                className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-[#7540D8] px-5 text-sm font-semibold"
              >
                <RefreshCw size={16} />
                Повторить
              </button>
            )}

            {status === "unlinked" ? (
              <a
                href="/login?returnTo=%2Faccount%3Ftab%3Dmax"
                className="mt-6 flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-[#6B30CE] to-[#8F5BFF] px-6 text-sm font-semibold text-white"
              >
                Войти и подключить MAX
              </a>
            ) : status === "unauthenticated" ? (
              <a
                href="/login?returnTo=%2Fmaxapp"
                className="mt-6 flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-[#6B30CE] to-[#8F5BFF] px-6 text-sm font-semibold text-white"
              >
                Войти по номеру телефона
              </a>
            ) : (
              <a
                href="/"
                className="mt-4 rounded-xl border border-white/10 px-5 py-3 text-sm text-white/75"
              >
                Перейти на сайт PongLab
              </a>
            )}
          </div>
        )}

        {status === "ready" && (
          <>
            <header className="px-4 pb-5 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold tracking-[0.25em] text-[#A77BFF]">
                    PONGLAB
                  </p>

                  <h1 className="mt-1 text-2xl font-semibold">
                    Личный кабинет
                  </h1>

                  <p className="mt-1 text-sm text-white/45">
                    {fullName || "Ваши тренировки"}
                  </p>
                </div>

                <button
                  onClick={() => void logout()}
                  disabled={loggingOut}
                  aria-label="Выйти"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/60"
                >
                  {loggingOut ? (
                    <RefreshCw size={17} className="animate-spin" />
                  ) : (
                    <LogOut size={17} />
                  )}
                </button>
              </div>
            </header>

            <main className="px-3">
              {tab === "bookings" && (
                <section className="space-y-4">
                  <BookingExtensionOffers />

                  <div className="rounded-2xl border border-white/10 bg-[#101326] p-3">
                    <AccountBookingsPanel
                      onCreateBooking={() => setTab("new")}
                      showTransferActions={true}
                      doorRequestChannel="web"
                    />
                  </div>
                </section>
              )}

              {tab === "new" && (
                <section className="rounded-2xl border border-white/10 bg-[#101326] p-3">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold">
                      Новое бронирование
                    </h2>

                    <p className="mt-1 text-xs text-white/45">
                      Выберите клуб, дату и свободное время.
                    </p>
                  </div>

                  <BookingCalendar returnTo="/maxapp?tab=new" />
                </section>
              )}

              {tab === "profile" && (
                <section className="rounded-2xl border border-white/10 bg-[#101326] p-4">
                  <AccountProfilePanel />
                </section>
              )}

              {tab === "stats" && (
                <section className="rounded-2xl border border-white/10 bg-[#101326] p-4">
                  <AccountStatsPanel />
                </section>
              )}

              {tab === "notifications" && (
                <section className="rounded-2xl border border-white/10 bg-[#101326] p-4">
                  <AccountNotificationsPanel />
                </section>
              )}
            </main>

            <nav
              className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#0D1020]/95 px-1 pt-2 backdrop-blur-xl"
              style={{
                paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))",
              }}
            >
              <div className="mx-auto grid max-w-xl grid-cols-5">
                {tabs.map(({ id, label, icon: Icon }) => {
                  const active = tab === id;

                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setTab(id);
                        if (id === "notifications") {
                          void loadUnreadCount();
                        }
                      }}
                      className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition ${
                        active
                          ? "text-[#C5ACFF]"
                          : "text-white/40"
                      }`}
                    >
                      <span className="relative inline-flex">
                        <Icon size={20} />

                        {id === "notifications" && unreadCount > 0 && (
                          <span
                            aria-label={"Непрочитанных уведомлений: " + unreadCount}
                            className="absolute -right-3 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white shadow-lg"
                          >
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </span>

                      <span className="truncate text-[10px] font-medium">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </nav>
          </>
        )}
      </div>
    </>
  );
}
