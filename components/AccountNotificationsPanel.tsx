"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";

type Notification = {
  id: string;
  type: "booking" | "payment" | "training" | "schedule" | "system";
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата не указана";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AccountNotificationsPanel() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/account/notifications", { credentials: "same-origin", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось загрузить уведомления.");
      setItems(Array.isArray(result.notifications) ? result.notifications : []);
      setUnread(Number(result.unread_count) || 0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки уведомлений.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const markRead = async (ids?: string[]) => {
    if (updating) return;
    setUpdating(true);
    setError("");
    try {
      const response = await fetch("/api/account/notifications", {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : { all: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось обновить уведомления.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка обновления уведомлений.");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="flex items-center gap-3 py-8 text-sm text-white/60"><RefreshCw size={18} className="animate-spin" />Загружаем уведомления...</div>;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#6B30CE]/20 text-[#B99AFF]"><Bell size={20} /></span><div><h2 className="text-lg font-semibold text-white">Уведомления</h2><p className="text-sm text-white/50">{unread} непрочитанных</p></div></div>
        <button onClick={() => void markRead()} disabled={updating || unread === 0} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-white/70 hover:bg-white/[0.06] disabled:opacity-40"><CheckCheck size={16} />Прочитать все</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 text-center text-sm text-white/50">Уведомлений пока нет. Здесь будут появляться события бронирований, оплаты и тренировок.</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <article key={item.id} className={`rounded-2xl border p-4 ${item.read_at ? "border-white/10 bg-white/[0.025]" : "border-[#8F5BFF]/30 bg-[#6B30CE]/[0.08]"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="flex items-center gap-2"><h3 className="font-semibold text-white">{item.title}</h3>{!item.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-[#A77BFF]" />}</div><p className="mt-2 text-sm leading-6 text-white/65">{item.message}</p><time className="mt-2 block text-xs text-white/35">{formatDate(item.created_at)}</time></div>
                {!item.read_at && <button onClick={() => void markRead([item.id])} disabled={updating} className="shrink-0 text-xs text-[#C5ACFF] underline underline-offset-4 disabled:opacity-50">Прочитано</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
