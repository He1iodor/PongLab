
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type City = {
  id: string;
  name: string;
  is_active: boolean;
};

type Club = {
  id: string;
  city_id: string | null;
  name: string;
  address: string;
  timezone: string;
  is_active: boolean;
  created_at: string;
};

type Table = {
  id: string;
  studio_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

export default function AdminLocationsPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState("");
const [tables, setTables] = useState<Table[]>([]);
const [tableName, setTableName] = useState("");
const [loadingTables, setLoadingTables] = useState(false);
const [savingTable, setSavingTable] = useState(false);
  const [cityName, setCityName] = useState("");
  const [clubCityId, setClubCityId] = useState("");
  const [clubName, setClubName] = useState("");
  const [clubAddress, setClubAddress] = useState("");
  const [timezone, setTimezone] = useState("Europe/Moscow");
  const [loading, setLoading] = useState(true);
  const [savingCity, setSavingCity] = useState(false);
  const [savingClub, setSavingClub] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    setAccessDenied(false);

    try {
      const [citiesResponse, clubsResponse] = await Promise.all([
        fetch("/api/admin/cities", {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch("/api/admin/clubs", {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);

      if (
        citiesResponse.status === 401 ||
        citiesResponse.status === 403 ||
        clubsResponse.status === 401 ||
        clubsResponse.status === 403
      ) {
        setAccessDenied(true);
        return;
      }

      const citiesData = await citiesResponse.json().catch(() => ({}));
      const clubsData = await clubsResponse.json().catch(() => ({}));

      if (!citiesResponse.ok || !clubsResponse.ok) {
        throw new Error(
          citiesData.error || clubsData.error || "Не удалось загрузить данные."
        );
      }

      const nextCities: City[] = citiesData.cities ?? [];
      setCities(nextCities);
      const nextClubs: Club[] = clubsData.clubs ?? [];
setClubs(nextClubs);

setSelectedClubId((current) => {
  if (current && nextClubs.some((club) => club.id === current)) {
    return current;
  }

  return (
    nextClubs.find((club) => club.is_active)?.id ??
    nextClubs[0]?.id ??
    ""
  );
});

      setClubCityId((current) => {
        if (current && nextCities.some((city) => city.id === current && city.is_active)) {
          return current;
        }
        return nextCities.find((city) => city.is_active)?.id ?? "";
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Ошибка загрузки данных."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTables = useCallback(async () => {
  if (!selectedClubId) {
    setTables([]);
    return;
  }

  setLoadingTables(true);
  setError("");

  try {
    const response = await fetch(
      `/api/admin/tables?studio_id=${encodeURIComponent(selectedClubId)}`,
      {
        cache: "no-store",
        credentials: "same-origin",
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Не удалось загрузить столы.");
    }

    setTables(data.tables ?? []);
  } catch (e) {
    setError(e instanceof Error ? e.message : "Ошибка загрузки столов.");
  } finally {
    setLoadingTables(false);
  }
}, [selectedClubId]);

useEffect(() => {
  void loadTables();
}, [loadTables]);

async function handleAddTable(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (savingTable || !selectedClubId || !tableName.trim()) return;

  setSavingTable(true);
  setMessage("");
  setError("");

  try {
    const response = await fetch("/api/admin/tables", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studio_id: selectedClubId,
        name: tableName.trim(),
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Не удалось добавить стол.");
    }

    setTableName("");
    setMessage("Стол добавлен.");
    await loadTables();
  } catch (e) {
    setError(e instanceof Error ? e.message : "Ошибка создания стола.");
  } finally {
    setSavingTable(false);
  }
}
  
  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleAddCity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingCity || !cityName.trim()) return;

    setSavingCity(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/cities", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cityName.trim() }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Не удалось добавить город.");
      }

      setCityName("");
      setMessage("Город добавлен.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка создания города.");
    } finally {
      setSavingCity(false);
    }
  }

  async function handleAddClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (savingClub || !clubCityId || !clubName.trim() || !clubAddress.trim()) {
      return;
    }

    setSavingClub(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/clubs", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city_id: clubCityId,
          name: clubName.trim(),
          address: clubAddress.trim(),
          timezone,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Не удалось добавить клуб.");
      }

      setClubName("");
      setClubAddress("");
      setMessage("Клуб добавлен.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка создания клуба.");
    } finally {
      setSavingClub(false);
    }
  }

  const activeCities = cities.filter((city) => city.is_active);

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
          <h1 className="mt-3 text-3xl font-semibold">
            Города и клубы
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            Сначала добавьте город, затем создайте клуб и укажите его адрес
            и часовой пояс.
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

        {accessDenied ? (
          <section className="mt-8 rounded-2xl border border-white/10 bg-[#151121] p-6">
            <h2 className="text-lg font-semibold">Нет доступа</h2>
            <p className="mt-2 text-sm text-white/60">
              Откройте панель владельца и подтвердите доступ. После этого
              вернитесь на эту страницу.
            </p>
            <Link
              href="/admin"
              className="mt-5 inline-flex rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold hover:bg-violet-400"
            >
              Перейти к панели владельца
            </Link>
          </section>
        ) : (
          <>
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-[#151121] p-5 sm:p-6">
                <h2 className="text-xl font-semibold">Добавить город</h2>
                <p className="mt-2 text-sm text-white/55">
                  Например, Казань или Москва.
                </p>

                <form onSubmit={handleAddCity} className="mt-5 space-y-4">
                  <label className="block text-sm">
                    Название города
                    <input
                      value={cityName}
                      onChange={(e) => setCityName(e.target.value)}
                      minLength={2}
                      maxLength={100}
                      required
                      placeholder="Казань"
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={savingCity || loading}
                    className="rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingCity ? "Сохраняем…" : "Добавить город"}
                  </button>
                </form>

                <div className="mt-7 border-t border-white/10 pt-5">
                  <h3 className="text-sm font-semibold text-white/80">
                    Города в системе ({cities.length})
                  </h3>
                  {loading ? (
                    <p className="mt-3 text-sm text-white/50">Загрузка…</p>
                  ) : cities.length === 0 ? (
                    <p className="mt-3 text-sm text-white/50">
                      Городов пока нет.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {cities.map((city) => (
                        <li
                          key={city.id}
                          className="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3 text-sm"
                        >
                          <span>{city.name}</span>
                          <span className={city.is_active ? "text-emerald-300" : "text-white/40"}>
                            {city.is_active ? "Активен" : "Отключён"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-[#151121] p-5 sm:p-6">
                <h2 className="text-xl font-semibold">Добавить клуб</h2>
                <p className="mt-2 text-sm text-white/55">
                  Каждый клуб относится к одному городу.
                </p>

                <form onSubmit={handleAddClub} className="mt-5 space-y-4">
                  <label className="block text-sm">
                    Город
                    <select
                      value={clubCityId}
                      onChange={(e) => setClubCityId(e.target.value)}
                      required
                      disabled={activeCities.length === 0}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-4 py-3 outline-none focus:border-violet-400 disabled:opacity-50"
                    >
                      <option value="">Выберите город</option>
                      {activeCities.map((city) => (
                        <option key={city.id} value={city.id}>
                          {city.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm">
                    Название клуба
                    <input
                      value={clubName}
                      onChange={(e) => setClubName(e.target.value)}
                      minLength={2}
                      maxLength={120}
                      required
                      placeholder="PongLab Центр"
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="block text-sm">
                    Адрес
                    <input
                      value={clubAddress}
                      onChange={(e) => setClubAddress(e.target.value)}
                      minLength={5}
                      maxLength={300}
                      required
                      placeholder="Улица, дом, помещение"
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="block text-sm">
                    Часовой пояс
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-4 py-3 outline-none focus:border-violet-400"
                    >
                      <option value="Europe/Moscow">Москва (Europe/Moscow)</option>
                      <option value="Europe/Kaliningrad">Калининград (Europe/Kaliningrad)</option>
                      <option value="Asia/Yekaterinburg">Екатеринбург (Asia/Yekaterinburg)</option>
                      <option value="Asia/Novosibirsk">Новосибирск (Asia/Novosibirsk)</option>
                      <option value="Asia/Vladivostok">Владивосток (Asia/Vladivostok)</option>
                    </select>
                  </label>

                  <button
                    type="submit"
                    disabled={savingClub || loading || activeCities.length === 0}
                    className="rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingClub ? "Сохраняем…" : "Добавить клуб"}
                  </button>

                  {activeCities.length === 0 && (
                    <p className="text-sm text-amber-200/80">
                      Сначала добавьте активный город.
                    </p>
                  )}
                </form>
              </section>
            </div>

            <section className="mt-6 rounded-2xl border border-white/10 bg-[#151121] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Клубы</h2>
                  <p className="mt-1 text-sm text-white/55">
                    Всего клубов: {clubs.length}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadData()}
                  disabled={loading}
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm transition hover:bg-white/5 disabled:opacity-50"
                >
                  Обновить
                </button>
              </div>

              {loading ? (
                <p className="mt-5 text-sm text-white/50">Загружаем клубы…</p>
              ) : clubs.length === 0 ? (
                <p className="mt-5 text-sm text-white/50">
                  Клубов пока нет. Создайте первый клуб выше.
                </p>
              ) : (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {clubs.map((club) => {
                    const city = cities.find((item) => item.id === club.city_id);
                    return (
                      <article
                        key={club.id}
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-semibold">{club.name}</h3>
                          <span className={club.is_active ? "text-xs text-emerald-300" : "text-xs text-white/40"}>
                            {club.is_active ? "Активен" : "Отключён"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-violet-200">
                          {city?.name ?? "Город не указан"}
                        </p>
                        <p className="mt-1 text-sm leading-5 text-white/60">
                          {club.address}
                        </p>
                        <p className="mt-3 text-xs text-white/40">
                          Часовой пояс: {club.timezone}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="mt-6 rounded-2xl border border-white/10 bg-[#151121] p-5 sm:p-6">
  <h2 className="text-xl font-semibold">Столы клуба</h2>
  <p className="mt-2 text-sm text-white/55">
    Выберите клуб, затем добавляйте столы, которые будут доступны для бронирования.
  </p>

  <div className="mt-5">
    <label className="block text-sm">
      Клуб
      <select
        value={selectedClubId}
        onChange={(e) => setSelectedClubId(e.target.value)}
        disabled={clubs.length === 0}
        className="mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-4 py-3 outline-none focus:border-violet-400 disabled:opacity-50"
      >
        <option value="">Выберите клуб</option>
        {clubs.map((club) => (
          <option key={club.id} value={club.id}>
            {club.name}
          </option>
        ))}
      </select>
    </label>
  </div>

  <form onSubmit={handleAddTable} className="mt-4 flex flex-col gap-3 sm:flex-row">
    <input
      value={tableName}
      onChange={(e) => setTableName(e.target.value)}
      minLength={1}
      maxLength={80}
      required
      disabled={!selectedClubId}
      placeholder="Например, Стол № 1"
      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400 disabled:opacity-50"
    />

    <button
      type="submit"
      disabled={savingTable || loadingTables || !selectedClubId}
      className="rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {savingTable ? "Сохраняем…" : "Добавить стол"}
    </button>
  </form>

  <div className="mt-6 border-t border-white/10 pt-5">
    <h3 className="text-sm font-semibold text-white/80">
      Список столов ({tables.length})
    </h3>

    {loadingTables ? (
      <p className="mt-3 text-sm text-white/50">Загрузка столов…</p>
    ) : !selectedClubId ? (
      <p className="mt-3 text-sm text-white/50">Сначала выберите клуб.</p>
    ) : tables.length === 0 ? (
      <p className="mt-3 text-sm text-white/50">
        В этом клубе пока нет столов.
      </p>
    ) : (
      <ul className="mt-3 space-y-2">
        {tables.map((table) => (
          <li
            key={table.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-4 py-3"
          >
            <span className="text-sm font-medium">{table.name}</span>
            <span className={table.is_active ? "text-xs text-emerald-300" : "text-xs text-white/40"}>
              {table.is_active ? "Активен" : "Отключён"}
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
</section>
          </>
        )}
      </div>
    </main>
  );
}
