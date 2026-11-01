
"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CircleHelp,
  DoorOpen,
  LockKeyhole,
  Wifi,
  WifiOff,
} from "lucide-react";

type Studio = { id: string; name: string; is_active: boolean };

type Device = {
  id: string;
  studio_id: string;
  studio_name: string;
  name: string;
  device_code: string;
  status: "active" | "disabled";
  door_state: "open" | "closed" | "unknown";
  last_seen_at: string | null;
  firmware_version: string | null;
  created_at: string;
};

type CreatedToken = {
  name: string;
  device_code: string;
  token: string;
};

const cardClass =
  "rounded-2xl border border-white/10 bg-[#151121] p-5 sm:p-6";

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-[#201a2e] px-3 py-3 text-sm text-white outline-none focus:border-violet-400 disabled:opacity-50";

function formatDate(value: string | null) {
  if (!value) return "Ещё не выходило на связь";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Дата неизвестна";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date);
}

function doorLabel(value: Device["door_state"]) {
  if (value === "open") return "Дверь открыта";
  if (value === "closed") return "Дверь закрыта";
  return "Состояние неизвестно";
}

function isOnline(value: string | null) {
  if (!value) return false;

  const time = Date.parse(value);

  return Number.isFinite(time) && Date.now() - time <= 90_000;
}

export default function AdminEquipmentPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [studioId, setStudioId] = useState("");
  const [name, setName] = useState("Контроллер двери");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [createdToken, setCreatedToken] =
    useState<CreatedToken | null>(null);

  const loadingRef = useRef(false);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (loadingRef.current) return;

    loadingRef.current = true;

    if (!options?.silent) {
      setLoading(true);
    }

    setError("");

    try {
      const response = await fetch("/api/admin/equipment", {
        cache: "no-store",
        credentials: "same-origin",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || "Не удалось загрузить оборудование."
        );
      }

      setDevices(
        Array.isArray(data.devices) ? data.devices : []
      );

      const nextStudios = Array.isArray(data.studios)
        ? data.studios
        : [];

      setStudios(nextStudios);

      setStudioId((current) => {
        return (
          current ||
          nextStudios.find((item: Studio) => item.is_active)?.id ||
          ""
        );
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Ошибка загрузки оборудования."
      );
    } finally {
      loadingRef.current = false;

      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  // Первичная загрузка и автоматическое обновление каждые 5 секунд.
  useEffect(() => {
    void load();

    const timer = window.setInterval(() => {
      void load({ silent: true });
    }, 5000);

    return () => window.clearInterval(timer);
  }, [load]);

  async function createDevice(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!studioId || saving) return;

    setSaving(true);
    setError("");
    setMessage("");
    setCreatedToken(null);

    try {
      const response = await fetch("/api/admin/equipment", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studio_id: studioId,
          name,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || "Не удалось зарегистрировать устройство."
        );
      }

      setCreatedToken({
        name: data.device.name,
        device_code: data.device.device_code,
        token: data.device_token,
      });

      setMessage(
        "Устройство зарегистрировано. Скопируй токен и сохрани его в безопасном месте."
      );

      setName("Контроллер двери");

      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Ошибка регистрации устройства."
      );
    } finally {
      setSaving(false);
    }
  }

  async function disableDevice(device: Device) {
    if (device.status !== "active" || busyId) return;

    if (
      !window.confirm(
        `Отключить устройство «${device.name}»? Его токен сразу перестанет работать.`
      )
    ) {
      return;
    }

    setBusyId(device.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/equipment", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "disable",
          device_id: device.id,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || "Не удалось отключить устройство."
        );
      }

      setMessage(`Устройство «${device.name}» отключено.`);

      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Ошибка отключения устройства."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function copyToken() {
    if (!createdToken) return;

    try {
      await navigator.clipboard.writeText(createdToken.token);
      setMessage("Токен скопирован. Сохрани его в менеджере секретов.");
    } catch {
      setMessage(
        "Автоматическое копирование недоступно. Выдели и скопируй токен вручную."
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0914] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin"
          className="text-sm text-violet-300 transition hover:text-violet-200"
        >
          ← Панель владельца
        </Link>

        <header className="mt-6 flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.24em] text-violet-300">
              PONGLAB · УПРАВЛЕНИЕ
            </p>

            <h1 className="mt-3 text-3xl font-semibold">
              Оборудование и доступ
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
              Регистрация контроллеров ESP32, контроль heartbeat
              и состояния датчиков двери. Команда открытия двери
              пока намеренно не реализована.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium transition hover:bg-white/5 disabled:opacity-50"
          >
            {loading ? "Обновляем…" : "Обновить"}
          </button>
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

        {createdToken && (
          <section className={`${cardClass} mt-6 border-amber-300/30`}>
            <h2 className="font-semibold text-amber-200">
              Токен устройства — показывается только сейчас
            </h2>

            <p className="mt-2 text-sm leading-6 text-white/60">
              Сохрани токен до ухода со страницы. В базе хранится
              только его SHA-256-хеш. Не вставляй его в публичный код
              или репозиторий.
            </p>

            <p className="mt-4 text-sm">
              Устройство: <strong>{createdToken.name}</strong>
              {" · "}код: <strong>{createdToken.device_code}</strong>
            </p>

            <textarea
              readOnly
              value={createdToken.token}
              rows={3}
              className="mt-3 w-full break-all rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-white"
            />

            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void copyToken()}
                className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold hover:bg-violet-400"
              >
                Скопировать токен
              </button>

              <button
                type="button"
                onClick={() => setCreatedToken(null)}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-sm hover:bg-white/5"
              >
                Я сохранил токен
              </button>
            </div>
          </section>
        )}

        <section className={`${cardClass} mt-6`}>
          <h2 className="font-semibold">Зарегистрировать контроллер</h2>

          <p className="mt-2 text-sm leading-6 text-white/55">
            Создаёт отдельный секрет для устройства. После создания
            его нужно записать в прошивку ESP32.
          </p>

          <form
            onSubmit={createDevice}
            className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <label className="block text-sm">
              Клуб

              <select
                value={studioId}
                onChange={(event) => setStudioId(event.target.value)}
                required
                disabled={saving || loading}
                className={inputClass}
              >
                <option value="">Выберите клуб</option>

                {studios
                  .filter((studio) => studio.is_active)
                  .map((studio) => (
                    <option key={studio.id} value={studio.id}>
                      {studio.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="block text-sm">
              Название контроллера

              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={2}
                maxLength={100}
                disabled={saving}
                className={inputClass}
                placeholder="Например, Дверь — вход"
              />
            </label>

            <button
              type="submit"
              disabled={
                saving ||
                loading ||
                !studioId ||
                name.trim().length < 2
              }
              className="rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Создаём…" : "Зарегистрировать"}
            </button>
          </form>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">Контроллеры</h2>

          {loading && (
            <div className={cardClass}>
              <p className="text-sm text-white/55">
                Загружаем список…
              </p>
            </div>
          )}

          {!loading && devices.length === 0 && (
            <div className={cardClass}>
              <p className="font-medium">Устройств пока нет</p>
              <p className="mt-2 text-sm text-white/50">
                Зарегистрируй контроллер выше.
              </p>
            </div>
          )}

          {!loading &&
            devices.map((device) => {
              const online =
                device.status === "active" &&
                isOnline(device.last_seen_at);

              const doorKnown =
                online &&
                device.status === "active" &&
                device.door_state !== "unknown";

              const doorClosed =
                doorKnown && device.door_state === "closed";

              const doorOpen =
                doorKnown && device.door_state === "open";

              const doorColor = !doorKnown
                ? "border-white/15 bg-white/5 text-white/55"
                : doorClosed
                  ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-200"
                  : "border-red-300/30 bg-red-400/15 text-red-200";

              return (
                <article
                  key={device.id}
                  className={`${cardClass} ${
                    doorClosed
                      ? "border-emerald-400/20"
                      : doorOpen
                        ? "border-red-400/30"
                        : ""
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {device.name}
                      </h3>

                      <p className="mt-1 text-sm text-white/55">
                        {device.studio_name} · код {device.device_code}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                          device.status === "disabled"
                            ? "border-red-300/20 bg-red-300/10 text-red-200"
                            : online
                              ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
                              : "border-amber-300/20 bg-amber-300/10 text-amber-200"
                        }`}
                      >
                        {online ? (
                          <Wifi size={14} />
                        ) : (
                          <WifiOff size={14} />
                        )}

                        {device.status === "disabled"
                          ? "Отключено"
                          : online
                            ? "На связи"
                            : "Нет связи"}
                      </span>

                      <span
                        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${doorColor}`}
                      >
                        {!doorKnown ? (
                          <CircleHelp size={19} />
                        ) : doorClosed ? (
                          <LockKeyhole size={19} />
                        ) : (
                          <DoorOpen size={19} />
                        )}

                        {!doorKnown
                          ? "Нет актуальных данных"
                          : doorClosed
                            ? "Дверь закрыта"
                            : "Дверь открыта"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <p className="text-xs text-white/40">
                        Датчик двери
                      </p>

                      <p
                        className={`mt-1 text-sm font-medium ${
                          !doorKnown
                            ? "text-white/50"
                            : doorClosed
                              ? "text-emerald-200"
                              : "text-red-200"
                        }`}
                      >
                        {doorLabel(device.door_state)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-white/40">
                        Последний heartbeat
                      </p>

                      <p className="mt-1 text-sm">
                        {formatDate(device.last_seen_at)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-white/40">
                        Версия прошивки
                      </p>

                      <p className="mt-1 text-sm">
                        {device.firmware_version || "Не передана"}
                      </p>
                    </div>
                  </div>

                  {device.status === "active" && (
                    <button
                      type="button"
                      onClick={() => void disableDevice(device)}
                      disabled={busyId !== null}
                      className="mt-5 rounded-xl border border-red-300/20 px-4 py-2.5 text-sm font-medium text-red-200 transition hover:bg-red-300/10 disabled:opacity-50"
                    >
                      {busyId === device.id
                        ? "Отключаем…"
                        : "Отключить устройство"}
                    </button>
                  )}
                </article>
              );
            })}
        </section>

        <p className="mt-6 text-xs leading-5 text-white/35">
          Автоматическое обновление каждые 5 секунд. Контроллер
          считается «на связи», если heartbeat получен за последние
          90 секунд. Если связь потеряна, состояние двери считается
          неизвестным. Индикация датчика не является подтверждением
          физической безопасности замка.
        </p>
      </div>
    </main>
  );
}
