"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Club = { id: string; name: string; is_active: boolean };
type Settings = {
  studio_id: string;
  slot_interval_minutes: number;
  allowed_durations_minutes: number[];
  booking_horizon_days: number;
  minimum_notice_minutes: number;
  hold_minutes: number;
  allow_same_day_booking: boolean;
};

const DEFAULTS: Omit<Settings, "studio_id"> = {
  slot_interval_minutes: 30,
  allowed_durations_minutes: [30, 60, 75, 90, 120],
  booking_horizon_days: 30,
  minimum_notice_minutes: 0,
  hold_minutes: 10,
  allow_same_day_booking: true,
};
const DURATION_OPTIONS = Array.from({ length: 94 }, (_, i) => (i + 3) * 5);

const inputClass = "mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-4 py-3 text-white outline-none focus:border-violet-400";
const cardClass = "rounded-2xl border border-white/10 bg-[#151121] p-5 sm:p-6";

export default function BookingSettingsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [studioId, setStudioId] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [newDuration, setNewDuration] = useState("45");
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadClubs = useCallback(async () => {
    setLoadingClubs(true);
    setError("");
    try {
      const response = await fetch("/api/admin/clubs", { cache: "no-store", credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить клубы.");
      const next: Club[] = data.clubs ?? [];
      setClubs(next);
      setStudioId((current) => current && next.some((club) => club.id === current)
        ? current : next.find((club) => club.is_active)?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки клубов.");
    } finally { setLoadingClubs(false); }
  }, []);

  const loadSettings = useCallback(async () => {
    if (!studioId) { setSettings(null); return; }
    setLoadingSettings(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/booking-settings?studio_id=${encodeURIComponent(studioId)}`, {
        cache: "no-store", credentials: "same-origin",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить настройки.");
      setSettings({ ...DEFAULTS, ...data.settings, studio_id: studioId });
    } catch (e) {
      setSettings(null);
      setError(e instanceof Error ? e.message : "Ошибка загрузки настроек.");
    } finally { setLoadingSettings(false); }
  }, [studioId]);

  useEffect(() => { void loadClubs(); }, [loadClubs]);
  useEffect(() => { void loadSettings(); }, [loadSettings]);

  function update<K extends keyof Omit<Settings, "studio_id">>(key: K, value: Settings[K]) {
    setSettings((current) => current ? { ...current, [key]: value } : current);
    setMessage("");
  }

  function addDuration() {
    const value = Number(newDuration);
    if (!Number.isInteger(value) || value < 15 || value > 480 || value % 5 !== 0) {
      setError("Длительность должна быть от 15 до 480 минут с шагом 5 минут.");
      return;
    }
    if (!settings) return;
    if (settings.allowed_durations_minutes.includes(value)) {
      setError("Эта длительность уже добавлена.");
      return;
    }
    update("allowed_durations_minutes", [...settings.allowed_durations_minutes, value].sort((a, b) => a - b));
    setError("");
  }

  async function save() {
    if (!settings || saving) return;
    if (!settings.allowed_durations_minutes.length) {
      setError("Нужно оставить хотя бы одну доступную длительность.");
      return;
    }
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/booking-settings", {
        method: "PUT",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить настройки.");
      setSettings({ ...DEFAULTS, ...data.settings, studio_id: studioId });
      setMessage("Настройки сохранены и применены к расчёту доступных слотов.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения настроек.");
    } finally { setSaving(false); }
  }

  const activeClub = clubs.find((club) => club.id === studioId);

  return (
    <main className="min-h-screen bg-[#0b0914] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-sm text-violet-300 transition hover:text-violet-200">← Панель владельца</Link>
        <header className="mt-6">
          <p className="text-xs font-semibold tracking-[0.24em] text-violet-300">PONGLAB · УПРАВЛЕНИЕ</p>
          <h1 className="mt-3 text-3xl font-semibold">Настройки бронирования</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
            Эти параметры хранятся отдельно для каждого клуба. Они управляют шагом начала слотов,
            разрешённой длительностью игры, глубиной календаря и правилами удержания неоплаченной брони.
          </p>
        </header>

        {message && <p className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">{message}</p>}
        {error && <p role="alert" className="mt-6 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}

        <section className={`${cardClass} mt-8`}>
          <label className="block text-sm">Клуб
            <select value={studioId} onChange={(e) => setStudioId(e.target.value)} disabled={loadingClubs || clubs.length === 0} className={inputClass}>
              <option value="">{loadingClubs ? "Загружаем клубы…" : "Выберите клуб"}</option>
              {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}{club.is_active ? "" : " (отключён)"}</option>)}
            </select>
          </label>
          {!loadingClubs && clubs.length === 0 && <p className="mt-3 text-sm text-amber-200/80">Сначала создайте клуб в разделе «Города и клубы».</p>}
        </section>

        {studioId && (loadingSettings || !settings) && <p className="mt-6 text-sm text-white/50">{loadingSettings ? "Загружаем настройки…" : "Настройки не загружены. Проверьте сообщение об ошибке и попробуйте обновить страницу."}</p>}

        {settings && !loadingSettings && <>
          <section className={`${cardClass} mt-6`}>
            <h2 className="text-xl font-semibold">Правила календаря</h2>
            <p className="mt-1 text-sm text-white/50">{activeClub?.name}</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="block text-sm">Шаг начала слотов
                <select value={settings.slot_interval_minutes} onChange={(e) => update("slot_interval_minutes", Number(e.target.value))} className={inputClass}>
                  {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((v) => <option key={v} value={v}>{v} минут</option>)}
                </select>
                <span className="mt-2 block text-xs leading-5 text-white/45">Например, при шаге 15 минут возможны старты в 09:00, 09:15, 09:30 и так далее.</span>
              </label>
              <label className="block text-sm">На сколько дней вперёд открывать бронирование
                <input type="number" min={1} max={365} step={1} value={settings.booking_horizon_days} onChange={(e) => update("booking_horizon_days", Number(e.target.value))} className={inputClass} />
              </label>
              <label className="block text-sm">Минимум минут до начала брони
                <input type="number" min={0} max={10080} step={5} value={settings.minimum_notice_minutes} onChange={(e) => update("minimum_notice_minutes", Number(e.target.value))} className={inputClass} />
                <span className="mt-2 block text-xs text-white/45">0 — можно бронировать ближайший ещё не начавшийся слот.</span>
              </label>
              <label className="block text-sm">Удержание неоплаченной брони
                <input type="number" min={1} max={60} step={1} value={settings.hold_minutes} onChange={(e) => update("hold_minutes", Number(e.target.value))} className={inputClass} />
                <span className="mt-2 block text-xs text-white/45">В минутах. Создание и автоматическое истечение брони должны использовать это значение.</span>
              </label>
            </div>
            <label className="mt-5 flex items-start gap-3 rounded-xl border border-white/10 p-4 text-sm">
              <input type="checkbox" checked={settings.allow_same_day_booking} onChange={(e) => update("allow_same_day_booking", e.target.checked)} className="mt-1 h-4 w-4 accent-violet-500" />
              <span><span className="block font-medium">Разрешить бронирование на сегодня</span><span className="mt-1 block text-xs leading-5 text-white/45">Если выключить, клиентам будут недоступны слоты на текущую дату клуба.</span></span>
            </label>
          </section>

          <section className={`${cardClass} mt-6`}>
            <h2 className="text-xl font-semibold">Доступная длительность игры</h2>
            <p className="mt-2 text-sm leading-6 text-white/55">Клиент увидит только эти варианты. Для каждого варианта, который должен открываться в календаре, должен существовать подходящий активный тариф.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {settings.allowed_durations_minutes.map((duration) => (
                <span key={duration} className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-2 text-sm">
                  {duration} мин
                  <button type="button" aria-label={`Убрать ${duration} минут`} onClick={() => update("allowed_durations_minutes", settings.allowed_durations_minutes.filter((v) => v !== duration))} disabled={settings.allowed_durations_minutes.length <= 1} className="text-white/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-30">×</button>
                </span>
              ))}
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block max-w-xs flex-1 text-sm">Добавить длительность, минут
                <input type="number" min={15} max={480} step={5} value={newDuration} onChange={(e) => setNewDuration(e.target.value)} className={inputClass} />
              </label>
              <button type="button" onClick={addDuration} className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/5">Добавить вариант</button>
            </div>
            <p className="mt-3 text-xs leading-5 text-white/40">Допустимо от 15 до 480 минут с шагом 5 минут. Удаление длительности из списка не удаляет старые тарифы, но скрывает эту длительность из доступных слотов.</p>
          </section>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-violet-500 px-6 py-3 font-semibold transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Сохраняем…" : "Сохранить настройки"}</button>
            <button type="button" onClick={() => void loadSettings()} disabled={saving || loadingSettings} className="rounded-xl border border-white/15 px-5 py-3 text-sm hover:bg-white/5 disabled:opacity-50">Отменить изменения</button>
          </div>
        </>}
      </div>
    </main>
  );
}
