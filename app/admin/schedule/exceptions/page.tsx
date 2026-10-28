
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Club = {
  id: string;
  name: string;
  is_active: boolean;
};

type Interval = {
  opens_at: string;
  closes_at: string;
};

type ExceptionItem = {
  id: string;
  studio_id: string;
  exception_date: string;
  is_closed: boolean;
  note: string | null;
  intervals: Interval[];
};

export default function AdminExceptionsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [studioId, setStudioId] = useState("");
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [date, setDate] = useState("");
  const [isClosed, setIsClosed] = useState(true);
  const [note, setNote] = useState("");
  const [intervals, setIntervals] = useState<Interval[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [loading, setLoading] = useState(false);
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

  const loadExceptions = useCallback(async () => {
    if (!studioId) {
      setExceptions([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/schedule/exceptions?studio_id=${encodeURIComponent(studioId)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Не удалось загрузить исключения.");
      }

      setExceptions(data.exceptions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки исключений.");
    } finally {
      setLoading(false);
    }
  }, [studioId]);

  useEffect(() => {
    void loadClubs();
  }, [loadClubs]);

  useEffect(() => {
    void loadExceptions();
  }, [loadExceptions]);

  function addInterval() {
    if (intervals.length < 10) {
      setIntervals((current) => [
        ...current,
        { opens_at: "09:00", closes_at: "22:00" },
      ]);
    }
  }

  function updateInterval(index: number, patch: Partial<Interval>) {
    setIntervals((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  }

  function removeInterval(index: number) {
    setIntervals((current) => current.filter((_, i) => i !== index));
  }

  function changeClosed(value: boolean) {
    setIsClosed(value);
    if (value) setIntervals([]);
    else if (intervals.length === 0) {
      setIntervals([{ opens_at: "09:00", closes_at: "22:00" }]);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!studioId || !date || saving) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/schedule/exceptions", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studio_id: studioId,
          exception_date: date,
          is_closed: isClosed,
          note: note.trim() || null,
          intervals: isClosed ? [] : intervals,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Не удалось сохранить исключение.");
      }

      setMessage("Исключение сохранено.");
      setDate("");
      setNote("");
      setIsClosed(true);
      setIntervals([]);
      await loadExceptions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;

    if (!window.confirm("Удалить это исключение?")) return;

    setDeletingId(id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/schedule/exceptions?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          cache: "no-store",
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Не удалось удалить исключение.");
      }

      setMessage("Исключение удалено.");
      await loadExceptions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка удаления.");
    } finally {
      setDeletingId("");
    }
  }

  const activeClub = clubs.find((club) => club.id === studioId);

  return (
    <main className="min-h-screen bg-[#0b0914] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/admin/schedule"
          className="text-sm text-violet-300 transition hover:text-violet-200"
        >
          ← Недельное расписание
        </Link>

        <header className="mt-6">
          <p className="text-xs font-semibold tracking-[0.24em] text-violet-300">
            PONGLAB · УПРАВЛЕНИЕ
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Особые даты</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            Закройте клуб на определённый день или задайте отдельные часы работы.
            Исключение действует только на выбранную дату.
          </p>
        </header>

        {message && (
          <p className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
            {message}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-6 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
            {error}
          </p>
        )}

        <section className="mt-8 rounded-2xl border border-white/10 bg-[#151121] p-5 sm:p-6">
          <label className="block text-sm">
            Клуб
            <select
              value={studioId}
              onChange={(event) => setStudioId(event.target.value)}
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
        </section>

        {studioId && (
          <>
            <section className="mt-6 rounded-2xl border border-white/10 bg-[#151121] p-5 sm:p-6">
              <h2 className="text-xl font-semibold">
                Добавить исключение
              </h2>

              <form onSubmit={handleSave} className="mt-5 space-y-5">
                <label className="block text-sm">
                  Дата
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    required
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-4 py-3 outline-none focus:border-violet-400"
                  />
                </label>

                <label className="block text-sm">
                  Причина или примечание (необязательно)
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={300}
                    placeholder="Например, техническое обслуживание"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400"
                  />
                </label>

                <div className="space-y-3">
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="radio"
                      checked={isClosed}
                      onChange={() => changeClosed(true)}
                      className="accent-violet-500"
                    />
                    Клуб закрыт весь день
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="radio"
                      checked={!isClosed}
                      onChange={() => changeClosed(false)}
                      className="accent-violet-500"
                    />
                    Особые часы работы
                  </label>
                </div>

                {!isClosed && (
                  <div className="space-y-3">
                    {intervals.map((interval, index) => (
                      <div
                        key={index}
                        className="flex flex-wrap items-end gap-3 rounded-xl bg-white/[0.04] p-3"
                      >
                        <label className="min-w-[120px] flex-1 text-sm">
                          Открытие
                          <input
                            type="time"
                            value={interval.opens_at}
                            onChange={(event) =>
                              updateInterval(index, { opens_at: event.target.value })
                            }
                            required
                            className="mt-2 w-full rounded-lg border border-white/10 bg-[#201a2e] px-3 py-2 outline-none focus:border-violet-400"
                          />
                        </label>

                        <label className="min-w-[120px] flex-1 text-sm">
                          Закрытие
                          <input
                            type="time"
                            value={interval.closes_at}
                            onChange={(event) =>
                              updateInterval(index, { closes_at: event.target.value })
                            }
                            required
                            className="mt-2 w-full rounded-lg border border-white/10 bg-[#201a2e] px-3 py-2 outline-none focus:border-violet-400"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => removeInterval(index)}
                          className="rounded-lg border border-red-400/20 px-3 py-2 text-sm text-red-200 hover:bg-red-400/10"
                        >
                          Удалить
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={addInterval}
                      disabled={intervals.length >= 10}
                      className="rounded-lg border border-violet-400/30 px-4 py-2 text-sm text-violet-200 hover:bg-violet-400/10 disabled:opacity-40"
                    >
                      + Добавить интервал
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving || !date || !studioId}
                  className="rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Сохраняем…" : "Сохранить исключение"}
                </button>
              </form>
            </section>

            <section className="mt-6 rounded-2xl border border-white/10 bg-[#151121] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Список исключений</h2>
                  <p className="mt-1 text-sm text-white/50">
                    {activeClub?.name ?? "Выбранный клуб"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadExceptions()}
                  disabled={loading}
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
                >
                  Обновить
                </button>
              </div>

              {loading ? (
                <p className="mt-5 text-sm text-white/50">Загружаем…</p>
              ) : exceptions.length === 0 ? (
                <p className="mt-5 text-sm text-white/50">
                  Исключений пока нет.
                </p>
              ) : (
                <div className="mt-5 space-y-3">
                  {exceptions.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">
                            {new Date(`${item.exception_date}T12:00:00`).toLocaleDateString("ru-RU", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </h3>
                          <p className={`mt-1 text-sm ${item.is_closed ? "text-red-200" : "text-emerald-200"}`}>
                            {item.is_closed ? "Клуб закрыт" : "Особые часы работы"}
                          </p>
                          {item.note && (
                            <p className="mt-2 text-sm text-white/60">{item.note}</p>
                          )}
                          {!item.is_closed && (
                            <ul className="mt-2 space-y-1 text-sm text-white/70">
                              {item.intervals.map((interval, index) => (
                                <li key={index}>
                                  {interval.opens_at.slice(0, 5)}–{interval.closes_at.slice(0, 5)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleDelete(item.id)}
                          disabled={deletingId === item.id}
                          className="rounded-lg border border-red-400/20 px-3 py-2 text-sm text-red-200 hover:bg-red-400/10 disabled:opacity-50"
                        >
                          {deletingId === item.id ? "Удаляем…" : "Удалить"}
                        </button>
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
