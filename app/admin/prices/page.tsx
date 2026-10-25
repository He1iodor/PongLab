
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Club = {
  id: string;
  name: string;
  is_active: boolean;
};

type PriceRule = {
  id: string;
  studio_id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  price_rub: number;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
};

const WEEKDAYS = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];

const EMPTY_FORM = {
  weekday: "1",
  starts_at: "09:00",
  ends_at: "17:00",
  duration_minutes: "60",
  price_rub: "",
  effective_from: "",
  effective_to: "",
  is_active: true,
};

type PriceForm = typeof EMPTY_FORM;

export default function AdminPricesPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [studioId, setStudioId] = useState("");
  const [rules, setRules] = useState<PriceRule[]>([]);
  const [form, setForm] = useState<PriceForm>({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState("");
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [loadingRules, setLoadingRules] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadClubs = useCallback(async () => {
    setLoadingClubs(true);
    setError("");

    try {
      const response = await fetch("/api/admin/clubs", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Не удалось загрузить клубы.");
      }

      const next: Club[] = data.clubs ?? [];
      setClubs(next);
      setStudioId((current) =>
        current && next.some((club) => club.id === current)
          ? current
          : next.find((club) => club.is_active)?.id ?? ""
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки клубов.");
    } finally {
      setLoadingClubs(false);
    }
  }, []);

  const loadRules = useCallback(async () => {
    if (!studioId) {
      setRules([]);
      return;
    }

    setLoadingRules(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/prices?studio_id=${encodeURIComponent(studioId)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Не удалось загрузить тарифы.");
      }

      setRules(data.rules ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки тарифов.");
    } finally {
      setLoadingRules(false);
    }
  }, [studioId]);

  useEffect(() => {
    void loadClubs();
  }, [loadClubs]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  function updateForm(patch: Partial<PriceForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM });
    setEditingId("");
  }

  function editRule(rule: PriceRule) {
    setEditingId(rule.id);
    setForm({
      weekday: String(rule.weekday),
      starts_at: rule.starts_at.slice(0, 5),
      ends_at: rule.ends_at.slice(0, 5),
      duration_minutes: String(rule.duration_minutes),
      price_rub: String(rule.price_rub),
      effective_from: rule.effective_from ?? "",
      effective_to: rule.effective_to ?? "",
      is_active: rule.is_active,
    });
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studioId || saving) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/prices", {
        method: editingId ? "PATCH" : "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          studio_id: studioId,
          weekday: Number(form.weekday),
          starts_at: form.starts_at,
          ends_at: form.ends_at,
          duration_minutes: Number(form.duration_minutes),
          price_rub: Number(form.price_rub),
          effective_from: form.effective_from || null,
          effective_to: form.effective_to || null,
          is_active: form.is_active,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Не удалось сохранить тариф.");
      }

      setMessage(editingId ? "Тариф обновлён." : "Тариф добавлен.");
      resetForm();
      await loadRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения тарифа.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    if (!window.confirm("Удалить этот тариф?")) return;

    setDeletingId(id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/prices?id=${encodeURIComponent(id)}&studio_id=${encodeURIComponent(studioId)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          cache: "no-store",
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Не удалось удалить тариф.");
      }

      if (editingId === id) resetForm();
      setMessage("Тариф удалён.");
      await loadRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка удаления тарифа.");
    } finally {
      setDeletingId("");
    }
  }

  const activeClub = clubs.find((club) => club.id === studioId);

  return (
    <main className="min-h-screen bg-[#0b0914] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin"
          className="text-sm text-violet-300 transition hover:text-violet-200"
        >
          ← Панель владельца
        </Link>

        <header className="mt-6">
          <p className="text-xs font-semibold tracking-[0.24em] text-violet-300">
            PONGLAB · УПРАВЛЕНИЕ
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Цены и тарифы</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            Настраивайте стоимость бронирования по дням недели,
            времени и длительности игры.
          </p>
        </header>

        {message && (
          <p className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
            {message}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200"
          >
            {error}
          </p>
        )}

        <section className="mt-8 rounded-2xl border border-white/10 bg-[#151121] p-5 sm:p-6">
          <label className="block text-sm">
            Выберите клуб
            <select
              value={studioId}
              onChange={(event) => {
                setStudioId(event.target.value);
                resetForm();
                setMessage("");
              }}
              disabled={loadingClubs || clubs.length === 0}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-4 py-3 outline-none focus:border-violet-400 disabled:opacity-50"
            >
              <option value="">
                {loadingClubs ? "Загружаем клубы…" : "Выберите клуб"}
              </option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}{club.is_active ? "" : " (отключён)"}
                </option>
              ))}
            </select>
          </label>

          {!loadingClubs && clubs.length === 0 && (
            <p className="mt-3 text-sm text-amber-200/80">
              Сначала создайте клуб в разделе «Города и клубы».
            </p>
          )}
        </section>

        {studioId && (
          <>
            <section className="mt-6 rounded-2xl border border-white/10 bg-[#151121] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">
                    {editingId ? "Редактирование тарифа" : "Добавить тариф"}
                  </h2>
                  <p className="mt-1 text-sm text-white/50">
                    {activeClub?.name} · цены в рублях
                  </p>
                </div>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
                  >
                    Отмена
                  </button>
                )}
              </div>

              <form onSubmit={handleSave} className="mt-5 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="block text-sm">
                    День недели
                    <select
                      value={form.weekday}
                      onChange={(e) => updateForm({ weekday: e.target.value })}
                      required
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-4 py-3 outline-none focus:border-violet-400"
                    >
                      {WEEKDAYS.map((day, index) => (
                        <option key={day} value={String(index + 1)}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm">
                    Начало действия по времени
                    <input
                      type="time"
                      value={form.starts_at}
                      onChange={(e) => updateForm({ starts_at: e.target.value })}
                      required
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-4 py-3 outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="block text-sm">
                    Окончание действия по времени
                    <input
                      type="time"
                      value={form.ends_at}
                      onChange={(e) => updateForm({ ends_at: e.target.value })}
                      required
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-4 py-3 outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="block text-sm">
                    Длительность бронирования
                    <select
                      value={form.duration_minutes}
                      onChange={(e) => updateForm({ duration_minutes: e.target.value })}
                      required
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-4 py-3 outline-none focus:border-violet-400"
                    >
                      {Array.from({ length: 94 }, (_, index) => (index + 3) * 5).map((minutes) => (
  <option key={minutes} value={String(minutes)}>
    {minutes} минут
  </option>
))}
                    </select>
                  </label>

                  <label className="block text-sm">
                    Цена, ₽
                    <input
                      type="number"
                      min="1"
                      max="1000000"
                      step="1"
                      value={form.price_rub}
                      onChange={(e) => updateForm({ price_rub: e.target.value })}
                      required
                      placeholder="Например, 600"
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-4 py-3 outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="flex items-center gap-3 self-end rounded-xl border border-white/10 px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => updateForm({ is_active: e.target.checked })}
                      className="h-4 w-4 accent-violet-500"
                    />
                    Тариф активен
                  </label>

                  <label className="block text-sm">
                    Действует с даты
                    <input
                      type="date"
                      value={form.effective_from}
                      onChange={(e) => updateForm({ effective_from: e.target.value })}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-4 py-3 outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="block text-sm">
                    Действует по дату включительно
                    <input
                      type="date"
                      value={form.effective_to}
                      min={form.effective_from || undefined}
                      onChange={(e) => updateForm({ effective_to: e.target.value })}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-4 py-3 outline-none focus:border-violet-400"
                    />
                  </label>
                </div>

                <p className="text-xs leading-5 text-white/45">
                  Если даты не указаны, тариф не ограничен периодом действия.
                  Время тарифа задаётся по часовому поясу клуба.
                </p>

                <button
                  type="submit"
                  disabled={saving || loadingRules}
                  className="rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? "Сохраняем…"
                    : editingId
                      ? "Сохранить изменения"
                      : "Добавить тариф"}
                </button>
              </form>
            </section>

            <section className="mt-6 rounded-2xl border border-white/10 bg-[#151121] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">
                  Тарифы клуба ({rules.length})
                </h2>
                <button
                  type="button"
                  onClick={() => void loadRules()}
                  disabled={loadingRules}
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
                >
                  Обновить
                </button>
              </div>

              {loadingRules ? (
                <p className="mt-5 text-sm text-white/50">Загружаем тарифы…</p>
              ) : rules.length === 0 ? (
                <p className="mt-5 text-sm text-white/50">
                  Тарифов пока нет. Добавьте первый тариф выше.
                </p>
              ) : (
                <div className="mt-5 space-y-3">
                  {rules.map((rule) => (
                    <article
                      key={rule.id}
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold">
                            {WEEKDAYS[rule.weekday - 1]} · {rule.starts_at.slice(0, 5)}–{rule.ends_at.slice(0, 5)}
                          </h3>
                          <p className="mt-1 text-sm text-white/60">
                            {rule.duration_minutes} минут · {Number(rule.price_rub).toLocaleString("ru-RU")} ₽
                          </p>
                          <p className="mt-1 text-xs text-white/40">
                            Период: {rule.effective_from || "без начала"} — {rule.effective_to || "без окончания"}
                          </p>
                          <p className={`mt-2 text-xs ${rule.is_active ? "text-emerald-300" : "text-white/40"}`}>
                            {rule.is_active ? "Активен" : "Отключён"}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => editRule(rule)}
                            className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/5"
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(rule.id)}
                            disabled={Boolean(deletingId)}
                            className="rounded-lg border border-red-400/20 px-3 py-2 text-sm text-red-200 hover:bg-red-400/10 disabled:opacity-50"
                          >
                            {deletingId === rule.id ? "Удаляем…" : "Удалить"}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
