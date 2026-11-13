"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Clock3, RefreshCw, Wallet } from "lucide-react";

type MonthStat = { month: string; sessions: number; minutes: number; spent_rub: number };
type Stats = {
  completed_count: number;
  total_minutes: number;
  total_spent_rub: number;
  last_training_at: string | null;
  monthly: MonthStat[];
};

const rubles = (value: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value || 0);
const duration = (minutes: number) => `${Math.floor((minutes || 0) / 60)} ч ${Math.max(0, (minutes || 0) % 60)} мин`;
const monthLabel = (value: string) => {
  const date = new Date(`${value}-01T00:00:00Z`);
  return new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(date);
};

export default function AccountStatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/account/stats", { credentials: "same-origin", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось загрузить статистику.");
      setStats(result.stats as Stats);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки статистики.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex items-center gap-3 py-8 text-sm text-white/60"><RefreshCw size={18} className="animate-spin" />Считаем статистику...</div>;
  if (error) return <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}<button onClick={() => void load()} className="ml-3 underline">Повторить</button></div>;
  if (!stats) return null;

  const monthly = Array.isArray(stats.monthly) ? stats.monthly : [];
  const maxSessions = Math.max(1, ...monthly.map((item) => item.sessions));

  return (
    <section className="space-y-5">
      <div><h2 className="text-lg font-semibold text-white">Статистика тренировок</h2><p className="mt-1 text-sm text-white/50">Учитываются только бронирования со статусом «завершена» и успешной оплатой.</p></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center gap-2 text-sm text-white/50"><Activity size={16} />Завершено</div><p className="mt-3 text-3xl font-semibold text-white">{stats.completed_count}</p><p className="mt-1 text-xs text-white/40">тренировок</p></article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center gap-2 text-sm text-white/50"><Clock3 size={16} />Время</div><p className="mt-3 text-2xl font-semibold text-white">{duration(stats.total_minutes)}</p><p className="mt-1 text-xs text-white/40">суммарная длительность</p></article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center gap-2 text-sm text-white/50"><Wallet size={16} />Оплачено</div><p className="mt-3 text-2xl font-semibold text-white">{rubles(stats.total_spent_rub)}</p><p className="mt-1 text-xs text-white/40">за завершённые тренировки</p></article>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <h3 className="font-semibold text-white">Динамика за 6 месяцев</h3>
        {stats.completed_count === 0 ? (
          <p className="mt-4 rounded-xl bg-white/[0.035] p-4 text-sm leading-6 text-white/55">Завершённых тренировок пока нет. Данные появятся после того, как бронирование будет фактически отмечено завершённым. Прошедшие подтверждённые брони автоматически завершёнными не считаются.</p>
        ) : (
          <div className="mt-5 grid grid-cols-6 gap-2">
            {monthly.map((item) => (
              <div key={item.month} className="flex min-w-0 flex-col items-center gap-2">
                <div className="flex h-28 w-full items-end justify-center rounded-lg bg-white/[0.035] p-1">
                  <div className="w-full rounded-md bg-gradient-to-t from-[#6B30CE] to-[#A77BFF]" style={{ height: `${Math.max(item.sessions ? 8 : 0, item.sessions / maxSessions * 100)}%` }} />
                </div>
                <span className="text-xs text-white/50">{monthLabel(item.month)}</span>
                <span className="text-xs tabular-nums text-white/75">{item.sessions}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs leading-5 text-white/35">Статистика робота-тренажёра пока не отображается: телеметрия и результаты тренировок робота ещё не подключены к учёту аккаунта.</p>
    </section>
  );
}
