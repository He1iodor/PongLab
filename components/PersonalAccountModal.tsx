
"use client";

import { useEffect, useState } from "react";
import BookingCalendar from "@/components/BookingCalendar";
import {
  X,
  Phone,
  UserRound,
  CalendarDays,
  LogOut,
  RefreshCw,
} from "lucide-react";

type PersonalAccountModalProps = {
  open: boolean;
  onClose: () => void;
};

type AccountRole = "owner" | "staff" | "customer" | null;

type SessionStatus =
  | "checking"
  | "authenticated"
  | "unauthenticated"
  | "error";

const ANIMATION_DURATION = 500;
const POLL_INTERVAL = 3000;

async function fetchAccountRole(): Promise<AccountRole> {
  try {
    const response = await fetch("/api/account/profile", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });

    if (!response.ok) return null;

    const result = await response.json();
    const role = result?.profile?.role;

    if (role === "owner" || role === "staff" || role === "customer") {
      return role;
    }

    return null;
  } catch {
    return null;
  }
}

export default function PersonalAccountModal({
  open,
  onClose,
}: PersonalAccountModalProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState(false);
  const [callPhone, setCallPhone] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>("checking");
  const [sessionRetryCount, setSessionRetryCount] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [accountRole, setAccountRole] = useState<AccountRole>(null);
  const [isLoadingRole, setIsLoadingRole] = useState(false);

  // Анимация открытия и закрытия окна.
  useEffect(() => {
    let frame1 = 0;
    let frame2 = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (open) {
      setMounted(true);
      frame1 = requestAnimationFrame(() => {
        frame2 = requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      timer = setTimeout(
        () => setMounted(false),
        ANIMATION_DURATION,
      );
    }

    return () => {
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
      if (timer) clearTimeout(timer);
    };
  }, [open]);

  // Блокируем прокрутку страницы, пока окно открыто.
  useEffect(() => {
    if (!mounted) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  // Закрытие по Escape.
  useEffect(() => {
    if (!mounted) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mounted, onClose]);

  // Проверяем существующую сессию при каждом открытии окна.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const checkSession = async () => {
      setSessionStatus("checking");

      try {
        const response = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });

        const result = await response.json().catch(() => ({}));

        if (cancelled) return;

        if (!response.ok) {
          setSessionStatus("error");
          return;
        }

        if (result.authenticated === true) {
          setSessionStatus("authenticated");
          setAuthSuccess(true);
          setAuthError("");
          setIsLoadingRole(true);
          const role = await fetchAccountRole();
          if (cancelled) return;
          setAccountRole(role);
          setIsLoadingRole(false);
        } else {
          setSessionStatus("unauthenticated");
          setAuthSuccess(false);
          setAccountRole(null);
          setIsLoadingRole(false);
        }
      } catch {
        if (!cancelled) {
          setSessionStatus("error");
        }
      }
    };

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [open, sessionRetryCount]);

  // Автоматически проверяем звонок каждые 3 секунды.
  useEffect(() => {
    if (!challengeId || !expiresAt || authSuccess) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const checkStatus = async () => {
      if (cancelled) return;

      if (Date.now() >= new Date(expiresAt).getTime()) {
        setAuthError(
          "Время проверки истекло. Запросите новый звонок.",
        );
        setCallPhone("");
        setChallengeId("");
        setExpiresAt("");
        return;
      }

      try {
        const response = await fetch("/api/auth/call/status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ challengeId }),
        });

        const result = await response.json().catch(() => ({}));

        if (cancelled) return;

        if (response.ok && result.verified === true) {
          setAuthSuccess(true);
          setSessionStatus("authenticated");
          setCallPhone("");
          setChallengeId("");
          setExpiresAt("");
          setAuthError("");
          setIsLoadingRole(true);
          void fetchAccountRole().then((role) => {
            setAccountRole(role);
            setIsLoadingRole(false);
          });
          return;
        }

        if (response.ok && result.status === "pending") {
          timer = setTimeout(checkStatus, POLL_INTERVAL);
          return;
        }

        if (
          response.status === 403 ||
          response.status === 409 ||
          response.status === 410
        ) {
          setAuthError(
            result.error ||
              "Проверка завершена. Запросите новый звонок.",
          );
          setCallPhone("");
          setChallengeId("");
          setExpiresAt("");
          return;
        }

        setAuthError("Проверяем статус звонка. Подождите...");
        timer = setTimeout(checkStatus, POLL_INTERVAL);
      } catch {
        if (!cancelled) {
          setAuthError(
            "Связь временно недоступна. Повторяем проверку...",
          );
          timer = setTimeout(checkStatus, POLL_INTERVAL);
        }
      }
    };

    void checkStatus();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [challengeId, expiresAt, authSuccess]);

  // Выход из аккаунта.
  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setLogoutError("");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });

      const result = await response.json().catch(() => ({}));

      // Серверный маршрут очищает cookie даже при ошибке
      // удаления записи сессии в Supabase.
      setSessionStatus("unauthenticated");
      setAuthSuccess(false);
      setAccountRole(null);
      setIsLoadingRole(false);
      setPhoneDigits("");
      setAuthError("");
      setCallPhone("");
      setChallengeId("");
      setExpiresAt("");

      if (!response.ok || result.success !== true) {
        setLogoutError(
          result.error ||
            "Вы вышли из аккаунта на этом устройстве, но сервер не подтвердил завершение сессии.",
        );
      }
    } catch {
      setLogoutError(
        "Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.",
      );
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handlePhoneChange = (value: string) => {
    const trimmed = value.trim();
    let digits = value.replace(/\D/g, "");

    if (trimmed.startsWith("+7")) {
      digits = digits.slice(1);
    } else if (trimmed.startsWith("8")) {
      digits = digits.slice(1);
    }

    setPhoneDigits(digits.slice(0, 10));
  };

  const isPhoneValid = phoneDigits.length === 10;

  const handleContinue = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (
      !isPhoneValid ||
      isSubmitting ||
      callPhone ||
      authSuccess
    ) {
      return;
    }

    setIsSubmitting(true);
    setAuthError("");
    setAuthSuccess(false);
    setAccountRole(null);
    setIsLoadingRole(false);
    setCallPhone("");
    setChallengeId("");
    setExpiresAt("");

    try {
      const response = await fetch("/api/auth/call/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          phone: `+7${phoneDigits}`,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setAuthError(
          result.error ||
            "Не удалось начать проверку. Попробуйте ещё раз.",
        );
        return;
      }

      if (
        typeof result.challengeId !== "string" ||
        typeof result.callPhone !== "string" ||
        typeof result.expiresAt !== "string"
      ) {
        setAuthError(
          "Сервер вернул некорректный ответ. Попробуйте позже.",
        );
        return;
      }

      setCallPhone(result.callPhone);
      setChallengeId(result.challengeId);
      setExpiresAt(result.expiresAt);
    } catch {
      setAuthError(
        "Не удалось связаться с сервером. Попробуйте ещё раз.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) return null;

  const isAuthenticated =
    sessionStatus === "authenticated" || authSuccess;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-[visibility] duration-500 ${
        visible ? "visible" : "invisible"
      }`}
      aria-hidden={!visible}
    >
      <button
        type="button"
        aria-label="Закрыть окно"
        tabIndex={visible ? 0 : -1}
        onClick={onClose}
        className={`absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm transition-opacity duration-500 motion-reduce:transition-none ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="personal-account-title"
        className={`relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-[#0D1022] p-7 text-white shadow-2xl transition-[opacity,transform] duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:p-9 ${
          visible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-8 scale-[0.88] opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          tabIndex={visible ? 0 : -1}
          className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={20} />
        </button>

        <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#6B30CE]/20 text-[#A77BFF]">
          {isAuthenticated ? (
            <UserRound size={27} strokeWidth={1.8} />
          ) : (
            <Phone size={27} strokeWidth={1.8} />
          )}
        </div>

        <div className="mb-8">
          <div className="mb-3 text-sm font-semibold tracking-[0.25em] text-[#A77BFF]">
            PongLab®
          </div>

          <h2
            id="personal-account-title"
            className="text-3xl font-semibold tracking-tight"
          >
            Личный кабинет
          </h2>

          <p className="mt-3 text-sm leading-6 text-white/60">
            {isAuthenticated
              ? "Управляйте своими тренировками и бронированиями."
              : "Введите собственный номер телефона, чтобы войти или создать аккаунт. Подтверждение будет выполнено посредством звонка."}
          </p>
        </div>

        {sessionStatus === "checking" && !authSuccess && (
          <div
            role="status"
            className="rounded-xl border border-white/10 bg-white/[0.04] p-5"
          >
            <div className="flex items-center gap-3">
              <RefreshCw
                size={20}
                className="animate-spin text-[#A77BFF]"
              />
              <p className="text-sm text-white/80">
                Проверяем авторизацию...
              </p>
            </div>
          </div>
        )}

        {sessionStatus === "error" && !authSuccess && (
          <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4">
            <p className="text-sm leading-6 text-white">
              Не удалось проверить сессию. Проверьте подключение и
              повторите попытку.
            </p>

            <button
              type="button"
              onClick={() =>
                setSessionRetryCount((count) => count + 1)
              }
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-semibold text-white transition-colors hover:bg-white/15"
            >
              <RefreshCw size={16} />
              Повторить проверку
            </button>
          </div>
        )}

        {isAuthenticated && (
          <div className="space-y-4">
            <div
              role="status"
              className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4"
            >
              <p className="text-base font-semibold text-white">
                Вы вошли в PongLab
              </p>

              <p className="mt-2 text-sm leading-6 text-white/65">
                Авторизация активна. Повторный звонок не требуется.
              </p>
            </div>

            {(accountRole === "owner" || accountRole === "staff") && (
              <a
                href="/admin"
                className="flex h-14 w-full items-center justify-center rounded-xl border border-[#8F5BFF]/40 bg-[#6B30CE]/15 px-4 text-center text-base font-semibold text-white transition-colors hover:bg-[#6B30CE]/25"
              >
                {accountRole === "owner" ? "Панель владельца" : "Панель сотрудника"}
              </a>
            )}

            {isLoadingRole && (
              <div className="flex items-center justify-center gap-2 text-sm text-white/50">
                <RefreshCw size={15} className="animate-spin" />
                Проверяем права доступа...
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start gap-3">
                <CalendarDays
                  size={21}
                  className="mt-0.5 text-[#A77BFF]"
                />

                <div>
                  <BookingCalendar />
            {logoutError && (
              <div
                role="alert"
                className="rounded-xl border border-red-400/30 bg-red-400/10 p-3"
              >
                <p className="text-sm leading-5 text-red-200">
                  {logoutError}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-white/75 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoggingOut ? (
                <RefreshCw size={17} className="animate-spin" />
              ) : (
                <LogOut size={17} />
              )}
              {isLoggingOut ? "Выходим..." : "Выйти из аккаунта"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex h-14 w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#6B30CE] to-[#8F5BFF] text-base font-semibold text-white transition-[opacity,transform] duration-200 hover:brightness-110 active:scale-[0.99]"
            >
              Продолжить
            </button>
          </div>
        )}

        {sessionStatus === "unauthenticated" && !authSuccess && (
          <form onSubmit={handleContinue}>
            <label
              htmlFor="account-phone"
              className="mb-2 block text-sm font-medium text-white/90"
            >
              Номер:
            </label>

            <div className="flex h-14 items-center overflow-hidden rounded-xl border border-white/15 bg-white/[0.04] transition-colors focus-within:border-[#8F5BFF]">
              <span
                className="flex h-full items-center border-r border-white/10 px-4 text-base text-white/80"
                aria-hidden="true"
              >
                +7
              </span>

              <input
                id="account-phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="999 123-45-67"
                value={phoneDigits}
                onChange={(event) =>
                  handlePhoneChange(event.target.value)
                }
                maxLength={15}
                required
                disabled={Boolean(callPhone) || authSuccess}
                aria-describedby="phone-hint"
                className="h-full min-w-0 flex-1 bg-transparent px-4 text-base text-white outline-none placeholder:text-white/30 disabled:opacity-60"
              />
            </div>

            <p
              id="phone-hint"
              aria-live="polite"
              className="mt-2 min-h-5 text-xs text-white/50"
            >
              {phoneDigits.length === 0
                ? "Введите 10 цифр номера"
                : phoneDigits.length < 10
                  ? `Введено ${phoneDigits.length} из 10 цифр`
                  : "Номер введён полностью"}
            </p>

            {authError && (
              <p
                role="alert"
                aria-live="polite"
                className="mt-3 text-sm text-red-400"
              >
                {authError}
              </p>
            )}

            {callPhone && (
              <div className="mt-4 rounded-xl border border-[#8F5BFF]/30 bg-[#6B30CE]/10 p-4">
                <p className="text-sm leading-6 text-white/80">
                  Позвоните на указанный номер в течение 5 минут.
                  Звонок будет автоматически сброшен после проверки.
                </p>

                <p className="mt-3 break-all text-xl font-semibold text-[#A77BFF]">
                  {callPhone}
                </p>

                <p className="mt-2 text-xs text-white/50">
                  Ожидаем подтверждения звонка...
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={
                !isPhoneValid ||
                isSubmitting ||
                Boolean(callPhone) ||
                authSuccess
              }
              className={`mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#6B30CE] to-[#8F5BFF] text-base font-semibold text-white transition-[opacity,transform,filter] duration-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${
                isPhoneValid ? "hover:brightness-110" : ""
              }`}
            >
              {isSubmitting
                ? "Отправка запроса..."
                : callPhone
                  ? "Ожидаем звонок..."
                  : "Продолжить"}
            </button>

            <p className="mt-5 text-center text-xs leading-5 text-white/40">
              Продолжая, вы соглашаетесь с обработкой персональных
              данных.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
