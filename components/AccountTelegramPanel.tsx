"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Send } from "lucide-react";
import AccountChannelNotificationSettings from "@/components/AccountChannelNotificationSettings";

type TelegramStatus = {
  authenticated?: boolean;
  linked?: boolean;
  username?: string | null;
  linked_at?: string | null;
  error?: string;
};

type LinkResponse = {
  deep_link?: string;
  expires_at?: string;
  error?: string;
};

export default function AccountTelegramPanel() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deepLink, setDeepLink] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/account/telegram/link", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      const result = (await response.json().catch(() => ({}))) as TelegramStatus;

      if (!response.ok) {
        throw new Error(result.error || "Не удалось проверить Telegram.");
      }

      setStatus(result);

      if (result.linked) {
        setDeepLink("");
        setExpiresAt("");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось проверить Telegram.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const createLink = async () => {
    if (creating) return;

    setCreating(true);
    setError("");
    setDeepLink("");
    setExpiresAt("");

    try {
      const response = await fetch("/api/account/telegram/link", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const result = (await response.json().catch(() => ({}))) as LinkResponse;

      if (!response.ok) {
        throw new Error(result.error || "Не удалось создать ссылку.");
      }

      if (!result.deep_link || !result.expires_at) {
        throw new Error("Сервер вернул некорректную ссылку.");
      }

      setDeepLink(result.deep_link);
      setExpiresAt(result.expires_at);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось создать ссылку.",
      );

      await refreshStatus();
    } finally {
      setCreating(false);
    }
  };

  const formattedExpiration = expiresAt
    ? new Intl.DateTimeFormat("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(expiresAt))
    : "";

  return (
    <section className="max-w-2xl">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#8F5BFF]/30 bg-[#7540D8]/15 text-[#C9ADFF]">
          <Send size={22} />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-white">Telegram</h2>
          <p className="mt-1 text-sm leading-6 text-white/50">
            Для удобства вы можете получать уведомления о занятиях и работе
            PongLab прямо в приложении Telegram.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-white/55">
            <Loader2 size={17} className="animate-spin" />
            Проверяем подключение...
          </div>
        ) : status?.linked ? (
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
              <CheckCircle2 size={18} />
              Telegram подключён
            </div>

            {status.username && (
              <p className="mt-2 text-sm text-white/60">
                Аккаунт: @{status.username}
              </p>
            )}

            <p className="mt-2 text-xs leading-5 text-white/40">
              Бот связан с вашим аккаунтом PongLab.
            </p>

            <button
              type="button"
              onClick={() => void refreshStatus()}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.06]"
            >
              <RefreshCw size={15} />
              Обновить статус
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-white">
              Telegram ещё не подключён
            </p>

            <p className="mt-2 text-sm leading-6 text-white/50">
              Создайте одноразовую ссылку и откройте её в Telegram.
              Код действует 10 минут.
            </p>

            {!deepLink ? (
              <button
                type="button"
                onClick={() => void createLink()}
                disabled={creating}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[#7540D8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#8654E8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                {creating ? "Создаём ссылку..." : "Подключить Telegram"}
              </button>
            ) : (
              <div className="mt-5">
                <a
                  href={deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#7540D8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#8654E8]"
                >
                  <Send size={16} />
                  Открыть Telegram
                  <ExternalLink size={14} />
                </a>

                <p className="mt-3 text-xs text-white/45">
                  Ссылка действительна до {formattedExpiration}.
                  Не передавайте её другим людям.
                </p>

                <button
                  type="button"
                  onClick={() => void refreshStatus()}
                  className="mt-4 inline-flex items-center gap-2 text-sm text-[#C5ACFF] hover:text-white"
                >
                  <RefreshCw size={14} />
                  Я уже нажал Start — проверить подключение
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 px-3 py-2.5 text-sm text-red-300">
            {error}
          </p>
        )}
      </div>

      <AccountChannelNotificationSettings channel="telegram" />
    </section>
  );
}
