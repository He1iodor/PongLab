"use client";

import { useEffect, useState } from "react";
import { BellOff, Loader2 } from "lucide-react";

type Props = { channel: "telegram" | "max" };

export default function AccountChannelNotificationSettings({ channel }: Props) {
  const [linked, setLinked] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const label = channel === "telegram" ? "Telegram" : "MAX";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/account/channel-notifications?channel=${channel}`, {
          credentials: "same-origin", cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Не удалось загрузить настройку.");
        if (!cancelled) {
          setLinked(result.linked === true);
          setEnabled(result.enabled !== false);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Ошибка загрузки настройки.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [channel]);

  const toggle = async () => {
    if (!linked || loading || saving) return;
    const next = !enabled;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/account/channel-notifications", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, enabled: next }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось сохранить настройку.");
      setEnabled(result.enabled === true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка сохранения настройки.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-5 border-t border-white/10 pt-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">Уведомления в {label}</p>
          <p className="mt-1 text-xs leading-5 text-white/45">
            {linked ? enabled ? "Уведомления включены" : "Уведомления выключены" : "Подключите аккаунт, чтобы управлять уведомлениями"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Уведомления в ${label}`}
          onClick={() => void toggle()}
          disabled={!linked || loading || saving}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-45 ${enabled ? "border-[#8F5BFF] bg-[#7540D8]" : "border-white/20 bg-white/10"}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${enabled ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>
      {(loading || saving) && (
        <p className="mt-2 flex items-center gap-2 text-xs text-white/45">
          <Loader2 size={13} className="animate-spin" />
          {loading ? "Загружаем настройку..." : "Сохраняем..."}
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3">
        <BellOff size={16} className="mt-0.5 shrink-0 text-white/45" />
        <p className="text-xs leading-5 text-white/50">
          Мы не отправляем рекламные сообщения. Уведомления нужны только для своевременного информирования о бронированиях и работе системы PongLab.
        </p>
      </div>
    </div>
  );
}
