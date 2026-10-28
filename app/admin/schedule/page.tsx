
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

type DaySchedule = {
  weekday: number;
  is_open: boolean;
  intervals: Interval[];
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

const EMPTY_DAYS: DaySchedule[] = Array.from({ length: 7 }, (_, index) => ({
  weekday: index + 1,
  is_open: false,
  intervals: [],
}));

export default function AdminSchedulePage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [studioId, setStudioId] = useState("");
  const [days, setDays] = useState<DaySchedule[]>(EMPTY_DAYS);
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

      const nextClubs: Club[] = data.clubs ?? [];
      setClubs(nextClubs);

      setStudioId((current) => {
        if (current && nextClubs.some((club) => club.id === current)) {
          return current;
        }
        return nextClubs.find((club) => club.is_active)?.id ?? "";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки клубов.");
    } finally {
      setLoadingClubs(false);
    }
  }, []);

  const loadSchedule = useCallback(async () => {
    if (!studioId) {
      setDays(EMPTY_DAYS);
      return;
    }

    setLoadingSchedule(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/schedule?studio_id=${encodeURIComponent(studioId)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Не удалось загрузить расписание.");
      }

      const loadedDays: DaySchedule[] = data.days ?? [];
      setDays(
        EMPTY_DAYS.map((emptyDay) => {
          const found = loadedDays.find(
            (day) => day.weekday === emptyDay.weekday
          );
          return found
            ? {
                weekday: found.weekday,
                is_open: found.is_open,
                intervals: (found.intervals ?? []).map((interval) => ({
                  opens_at: interval.opens_at.slice(0, 5),
                  closes_at: interval.closes_at.slice(0, 5),
                })),
              }
            : emptyDay;
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки расписания.");
    } finally {
      setLoadingSchedule(false);
    }
  }, [studioId]);

  useEffect(() => {
    void loadClubs();
  }, [loadClubs]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  function updateDay(weekday: number, patch: Partial<DaySchedule>) {
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday ? { ...day, ...patch } : day
      )
    );
  }

  function updateInterval(
    weekday: number,
    index: number,
    patch: Partial<Interval>
  ) {
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday
          ? {
              ...day,
              intervals: day.intervals.map((interval, i) =>
                i === index ? { ...interval, ...patch } : interval
              ),
            }
          : day
      )
    );
  }

  function addInterval(weekday: number) {
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday && day.intervals.length < 10
          ? {
              ...day,
              intervals: [
                ...day.intervals,
                { opens_at: "09:00", closes_at: "22:00" },
              ],
            }
          : day
      )
    );
  }

  function removeInterval(weekday: number, index: number) {
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday
          ? {
              ...day,
              intervals: day.intervals.filter((_, i) => i !== index),
            }
          : day
      )
    );
  }

  function toggleDay(weekday: number, isOpen: boolean) {
    updateDay(weekday, {
      is_open: isOpen,
      intervals: isOpen
        ? days.find((day) => day.weekday === weekday)?.intervals ?? []
        : [],
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!studioId || saving) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/schedule", {
        method: "PUT",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studio_id: studioId, days }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Не удалось сохранить расписание.");
      }

      setMessage("Расписание сохранено.");
      await loadSchedule();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения.");
    } finally {
      setSaving(false);
    }
  }

  const activeClub = clubs.find((club) => club.id === studioId);

  return (
    <main className="min-h-screen bg-[#0b0914] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
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
          <h1 className="mt-3 text-3xl font-semibold">Расписание клуба</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            Укажите рабочие дни и часы клуба. Можно задать несколько интервалов
            в течение одного дня.
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
          {!loadingClubs && clubs.length === 0 && (
            <p className="mt-3 text-sm text-amber-200/80">
              Сначала создайте клуб на странице управления городами и клубами.
            </p>
          )}
        </section>

        {studioId && (
          <form onSubmit={handleSave} className="mt-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">
                  {activeClub?.name ?? "Рабочая неделя"}
                </h2>
                <p className="mt-1 text-sm text-white/50">
                  Время указывается по часовому поясу клуба.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadSchedule()}
                disabled={loadingSchedule || saving}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm transition hover:bg-white/5 disabled:opacity-50"
              >
                Обновить
              </button>
            </div>

            {loadingSchedule ? (
              <div className="rounded-2xl border border-white/10 bg-[#151121] p-6 text-sm text-white/50">
                Загружаем расписание…
              </div>
            ) : (
              <div className="space-y-3">
                {days.map((day) => (
                  <section
                    key={day.weekday}
                    className="rounded-2xl border border-white/10 bg-[#151121] p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-3 font-semibold">
                        <input
                          type="checkbox"
                          checked={day.is_open}
                          onChange={(event) =>
                            toggleDay(day.weekday, event.target.checked)
                          }
                          className="h-4 w-4 accent-violet-500"
                        />
                        {WEEKDAYS[day.weekday - 1]}
                      </label>
                      <span className="text-xs text-white/45">
                        {day.is_open ? "Рабочий день" : "Выходной"}
                      </span>
                    </div>

                    {day.is_open && (
                      <div className="mt-4 space-y-3">
                        {day.intervals.map((interval, index) => (
                          <div
                            key={`${day.weekday}-${index}`}
                            className="flex flex-wrap items-end gap-3 rounded-xl bg-white/[0.04] p-3"
                          >
                            <label className="min-w-[120px] flex-1 text-sm">
                              Открытие
                              <input
                                type="time"
                                value={interval.opens_at}
                                onChange={(event) =>
                                  updateInterval(day.weekday, index, {
                                    opens_at: event.target.value,
                                  })
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
                                  updateInterval(day.weekday, index, {
                                    closes_at: event.target.value,
                                  })
                                }
                                required
                                className="mt-2 w-full rounded-lg border border-white/10 bg-[#201a2e] px-3 py-2 outline-none focus:border-violet-400"
                              />
                            </label>

                            <button
                              type="button"
                              onClick={() => removeInterval(day.weekday, index)}
                              className="rounded-lg border border-red-400/20 px-3 py-2 text-sm text-red-200 hover:bg-red-400/10"
                            >
                              Удалить
                            </button>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => addInterval(day.weekday)}
                          disabled={day.intervals.length >= 10}
                          className="rounded-lg border border-violet-400/30 px-4 py-2 text-sm text-violet-200 transition hover:bg-violet-400/10 disabled:opacity-40"
                        >
                          + Добавить интервал
                        </button>

                        {day.intervals.length === 0 && (
                          <p className="text-sm text-amber-200/80">
                            День включён, но рабочие интервалы ещё не добавлены.
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || loadingSchedule || !studioId}
              className="mt-6 rounded-xl bg-violet-500 px-6 py-3 font-semibold transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Сохраняем…" : "Сохранить расписание"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
