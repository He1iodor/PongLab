"use client";

import { useEffect, useState } from "react";
import { Bell, CalendarDays, BarChart3, LogOut, RefreshCw, UserRound } from "lucide-react";
import AccountBookingsPanel from "@/components/AccountBookingsPanel";
import AccountNotificationsPanel from "@/components/AccountNotificationsPanel";
import AccountProfilePanel from "@/components/AccountProfilePanel";
import AccountStatsPanel from "@/components/AccountStatsPanel";
import BookingCalendar from "@/components/BookingCalendar";

type Tab = "bookings" | "profile" | "stats" | "notifications" | "new";

const tabs: Array<{ id: Tab; label: string; icon: typeof CalendarDays }> = [
  { id: "bookings", label: "Бронирования", icon: CalendarDays },
  { id: "profile", label: "Профиль", icon: UserRound },
  { id: "stats", label: "Статистика", icon: BarChart3 },
  { id: "notifications", label: "Уведомления", icon: Bell },
];

export default function AccountDashboard() {
  const [tab, setTab] = useState<Tab>("bookings");
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch("/api/account/profile", { credentials: "same-origin", cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setAuthenticated(false);
          setError(result.error || "Для доступа войдите в личный кабинет.");
        } else {
          setAuthenticated(true);
          setFullName(result.profile?.full_name || "");
        }
      } catch {
        if (!cancelled) setError("Не удалось проверить авторизацию.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void check();
    return () => { cancelled = true; };
  }, []);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
      window.location.assign("/");
    } catch {
      setError("Не удалось завершить сессию. Попробуйте ещё раз.");
      setLoggingOut(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-white/60"><RefreshCw size={18} className="animate-spin" />Проверяем доступ...</div>;
  }

  if (!authenticated) {
    return <div className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-5 text-center"><UserRound size={32} className="text-[#B99AFF]" /><h1 className="mt-4 text-2xl font-semibold text-white">Войдите в PongLab</h1><p className="mt-3 text-sm leading-6 text-white/55">{error || "Сначала авторизуйтесь через личный кабинет на главной странице."}</p><a href="/" className="mt-6 rounded-xl bg-[#7540D8] px-5 py-3 text-sm font-semibold text-white">На главную страницу</a></div>;
  }

  return (
    <div className="min-h-screen bg-[#090B18] px-3 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-xs font-semibold tracking-[0.25em] text-[#A77BFF]">PONGLAB</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Личный кабинет</h1><p className="mt-1 text-sm text-white/45">{fullName ? `Здравствуйте, ${fullName}` : "Бронирования, профиль и статистика"}</p></div>
          <div className="flex items-center gap-2"><a href="/" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/70 hover:bg-white/[0.06]">На главную</a><button onClick={() => void logout()} disabled={loggingOut} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/70 hover:bg-white/[0.06] disabled:opacity-50"><LogOut size={15} />{loggingOut ? "Выходим..." : "Выйти"}</button></div>
        </header>

        <nav className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.025] p-2">
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm transition ${tab === id ? "bg-[#7540D8] text-white" : "text-white/60 hover:bg-white/[0.06] hover:text-white"}`}><Icon size={16} />{label}</button>)}
          <button onClick={() => setTab("new")} className={`ml-auto inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm transition ${tab === "new" ? "bg-[#7540D8] text-white" : "border border-[#8F5BFF]/30 text-[#D6C5FF] hover:bg-[#7540D8]/20"}`}><CalendarDays size={16} />Новая бронь</button>
        </nav>

        <main className="min-h-[420px] rounded-3xl border border-white/10 bg-[#101326] p-4 sm:p-6">
          {tab === "bookings" && <AccountBookingsPanel onCreateBooking={() => setTab("new")} />}
          {tab === "profile" && <AccountProfilePanel />}
          {tab === "stats" && <AccountStatsPanel />}
          {tab === "notifications" && <AccountNotificationsPanel />}
          {tab === "new" && <div><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Новое бронирование</h2><p className="mt-1 text-sm text-white/50">Выберите клуб, дату и свободное время.</p></div><button onClick={() => setTab("bookings")} className="text-sm text-[#C5ACFF] underline">К бронированиям</button></div><BookingCalendar /></div>}
        </main>
        <p className="mt-5 text-center text-xs text-white/30">PongLab · Данные аккаунта доступны только после проверки серверной сессии.</p>
      </div>
    </div>
  );
}
