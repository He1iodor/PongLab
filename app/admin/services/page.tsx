"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";

type AvailabilityRules = {
  weekdays?: number[];
  date_ranges?: Array<{ from: string; to: string }>;
  time_intervals?: Array<{ starts_at: string; ends_at: string }>;
};

type Studio = {
  id: string;
  name: string;
  address: string | null;
  city_id: string;
  timezone: string;
};

type StudioService = {
  id: string;
  studio_id: string;
  service_key: "joint_play" | "coach_session";
  title: string;
  description: string | null;
  is_enabled: boolean;
  price_rub: number;
  charge_mode: "per_slot" | "per_group";
  availability_rules: AvailabilityRules;
  updated_at: string;
};

const weekdays = [
  { id: 1, label: "Пн" },
  { id: 2, label: "Вт" },
  { id: 3, label: "Ср" },
  { id: 4, label: "Чт" },
  { id: 5, label: "Пт" },
  { id: 6, label: "Сб" },
  { id: 7, label: "Вс" },
];

function serviceLabel(key: StudioService["service_key"]) {
  return key === "joint_play" ? "Совместная сессия" : "Сессия с тренером";
}

function normalizeRules(value: AvailabilityRules | null | undefined): AvailabilityRules {
  return {
    weekdays: Array.isArray(value?.weekdays) ? value.weekdays : [],
    date_ranges: Array.isArray(value?.date_ranges) ? value.date_ranges : [],
    time_intervals: Array.isArray(value?.time_intervals) ? value.time_intervals : [],
  };
}

export default function AdminServicesPage() {
  const [studios, setStudios] = useState<Studio[]>([]);
  const [services, setServices] = useState<StudioService[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/services", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось загрузить услуги.");
      setStudios(Array.isArray(result.studios) ? result.studios : []);
      setServices(Array.isArray(result.services) ? result.services.map((item: StudioService) => ({
        ...item,
        availability_rules: normalizeRules(item.availability_rules),
      })) : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateService = (id: string, patch: Partial<StudioService>) => {
    setServices((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const updateRules = (service: StudioService, patch: Partial<AvailabilityRules>) => {
    updateService(service.id, {
      availability_rules: { ...normalizeRules(service.availability_rules), ...patch },
    });
  };

  const save = async (service: StudioService) => {
    if (savingId) return;
    setSavingId(service.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/services", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studio_id: service.studio_id,
          service_key: service.service_key,
          title: service.title,
          description: service.description || null,
          is_enabled: service.is_enabled,
          price_rub: service.price_rub,
          charge_mode: service.charge_mode,
          availability_rules: normalizeRules(service.availability_rules),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось сохранить услугу.");
      setMessage(`${service.title}: настройки сохранены.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка сохранения.");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 py-8 text-sm text-white/60"><RefreshCw size={16} className="animate-spin" /> Загружаем услуги…</div>;
  }

  return (
    <div className="space-y-7 text-white">
      <header>
        <h1 className="text-2xl font-semibold">Дополнительные услуги</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-white/50">
          Настройки задаются отдельно для каждого клуба. Пустые ограничения означают доступность во все дни, даты и часы. При переносе брони сервер проверит доступность выбранной услуги в целевом клубе и времени; если услуга недоступна, перенос будет отклонён.
        </p>
      </header>

      {studios.map((studio) => (
        <section key={studio.id} className="space-y-3">
          <div className="border-b border-white/10 pb-2">
            <h2 className="text-lg font-semibold">{studio.name}</h2>
            <p className="text-xs text-white/40">{studio.address || "Адрес не указан"} · {studio.timezone}</p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {services.filter((service) => service.studio_id === studio.id).map((service) => {
              const rules = normalizeRules(service.availability_rules);
              return (
                <article key={service.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="font-semibold">{serviceLabel(service.service_key)}</h3>
                    <label className="flex items-center gap-2 text-xs text-white/60">
                      <input type="checkbox" checked={service.is_enabled} onChange={(event) => updateService(service.id, { is_enabled: event.target.checked })} /> Включена
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-white/50 sm:col-span-2">Название в приложении
                      <input value={service.title} maxLength={120} onChange={(event) => updateService(service.id, { title: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#101326] px-3 text-sm text-white" />
                    </label>
                    <label className="text-xs text-white/50 sm:col-span-2">Описание
                      <textarea value={service.description || ""} maxLength={1000} rows={2} onChange={(event) => updateService(service.id, { description: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#101326] p-3 text-sm text-white" />
                    </label>
                    <label className="text-xs text-white/50">Цена, ₽
                      <input type="number" min="0" step="1" value={service.price_rub} onChange={(event) => updateService(service.id, { price_rub: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#101326] px-3 text-sm text-white" />
                    </label>
                    <label className="text-xs text-white/50">Способ расчёта
                      <select value={service.charge_mode} onChange={(event) => updateService(service.id, { charge_mode: event.target.value as StudioService["charge_mode"] })} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#101326] px-3 text-sm text-white">
                        <option value="per_slot">За каждый слот</option>
                        <option value="per_group">За всю группу слотов</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-5 space-y-4 border-t border-white/10 pt-4">
                    <div>
                      <p className="text-xs font-semibold text-white/65">Дни недели</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {weekdays.map((day) => {
                          const checked = rules.weekdays?.includes(day.id) ?? false;
                          return <label key={day.id} className={`inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs ${checked ? "border-violet-400/40 bg-violet-400/10 text-violet-100" : "border-white/10 text-white/45"}`}>
                            <input type="checkbox" checked={checked} onChange={(event) => updateRules(service, { weekdays: event.target.checked ? [...(rules.weekdays || []), day.id].sort() : (rules.weekdays || []).filter((value) => value !== day.id) })} /> {day.label}
                          </label>;
                        })}
                      </div>
                      <p className="mt-1 text-[11px] text-white/35">Если ни один день не выбран, услуга доступна ежедневно.</p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-white/65">Периоды дат</p>
                        <button type="button" onClick={() => updateRules(service, { date_ranges: [...(rules.date_ranges || []), { from: "", to: "" }] })} className="inline-flex items-center gap-1 text-xs text-violet-200"><Plus size={13} /> Добавить период</button>
                      </div>
                      {(rules.date_ranges || []).length === 0 ? <p className="mt-2 text-[11px] text-white/35">Без ограничений по датам.</p> : (rules.date_ranges || []).map((range, index) => (
                        <div key={`${service.id}-date-${index}`} className="mt-2 flex flex-wrap items-center gap-2">
                          <input type="date" value={range.from} onChange={(event) => updateRules(service, { date_ranges: (rules.date_ranges || []).map((item, i) => i === index ? { ...item, from: event.target.value } : item) })} className="h-9 rounded-lg border border-white/10 bg-[#101326] px-2 text-xs text-white" />
                          <span className="text-xs text-white/35">—</span>
                          <input type="date" value={range.to} onChange={(event) => updateRules(service, { date_ranges: (rules.date_ranges || []).map((item, i) => i === index ? { ...item, to: event.target.value } : item) })} className="h-9 rounded-lg border border-white/10 bg-[#101326] px-2 text-xs text-white" />
                          <button type="button" onClick={() => updateRules(service, { date_ranges: (rules.date_ranges || []).filter((_, i) => i !== index) })} className="rounded-lg p-2 text-red-200/70 hover:bg-red-400/10"><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-white/65">Интервалы времени</p>
                        <button type="button" onClick={() => updateRules(service, { time_intervals: [...(rules.time_intervals || []), { starts_at: "10:00", ends_at: "20:00" }] })} className="inline-flex items-center gap-1 text-xs text-violet-200"><Plus size={13} /> Добавить интервал</button>
                      </div>
                      {(rules.time_intervals || []).length === 0 ? <p className="mt-2 text-[11px] text-white/35">Без ограничений по времени.</p> : (rules.time_intervals || []).map((interval, index) => (
                        <div key={`${service.id}-time-${index}`} className="mt-2 flex flex-wrap items-center gap-2">
                          <input type="time" value={interval.starts_at} onChange={(event) => updateRules(service, { time_intervals: (rules.time_intervals || []).map((item, i) => i === index ? { ...item, starts_at: event.target.value } : item) })} className="h-9 rounded-lg border border-white/10 bg-[#101326] px-2 text-xs text-white" />
                          <span className="text-xs text-white/35">—</span>
                          <input type="time" value={interval.ends_at} onChange={(event) => updateRules(service, { time_intervals: (rules.time_intervals || []).map((item, i) => i === index ? { ...item, ends_at: event.target.value } : item) })} className="h-9 rounded-lg border border-white/10 bg-[#101326] px-2 text-xs text-white" />
                          <button type="button" onClick={() => updateRules(service, { time_intervals: (rules.time_intervals || []).filter((_, i) => i !== index) })} className="rounded-lg p-2 text-red-200/70 hover:bg-red-400/10"><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button type="button" onClick={() => void save(service)} disabled={Boolean(savingId)} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-violet-400/30 px-4 text-sm text-violet-100 disabled:opacity-50">
                    {savingId === service.id ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} Сохранить услугу
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {(error || message) && <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${error ? "border-red-400/20 bg-red-400/[0.06] text-red-100" : "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100"}`}>{error ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}{error || message}</div>}
    </div>
  );
}
