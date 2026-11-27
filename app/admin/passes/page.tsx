"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Save } from "lucide-react";

type City = { id: string; name: string; timezone: string | null; is_active: boolean };
type PassPlan = {
  id: string;
  city_id: string;
  city_name: string;
  name: string;
  description: string | null;
  price_rub: number;
  hours_count: number;
  is_active: boolean;
  validity_label: string;
};

type LatePaymentReview = {
  id: string;
  user_id: string;
  provider_payment_id: string | null;
  amount_rub: number;
  paid_at: string | null;
  failure_reason: string | null;
  user_pass_id: string | null;
  pass_name: string;
  pass_status: string;
  pass_purchase_local_date: string | null;
  pass_expires_at: string | null;
  city_name: string;
};

type PlanDraft = {
  city_id: string;
  name: string;
  description: string;
  price_rub: string;
  hours_count: string;
};

const emptyDraft: PlanDraft = {
  city_id: "",
  name: "",
  description: "",
  price_rub: "",
  hours_count: "",
};

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function AdminPassesPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [plans, setPlans] = useState<PassPlan[]>([]);
  const [latePaymentReviews, setLatePaymentReviews] = useState<LatePaymentReview[]>([]);
  const [draft, setDraft] = useState<PlanDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/passes", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось загрузить тарифы.");
      const cityRows = Array.isArray(result.cities) ? result.cities : [];
      setCities(cityRows);
      setPlans(Array.isArray(result.plans) ? result.plans : []);
      setLatePaymentReviews(Array.isArray(result.late_payment_reviews) ? result.late_payment_reviews : []);
      setDraft((current) => ({
        ...current,
        city_id: current.city_id || cityRows.find((city: City) => city.is_active)?.id || "",
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const createPlan = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/passes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          price_rub: Number(draft.price_rub),
          hours_count: Number(draft.hours_count),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось создать тариф.");
      setDraft((current) => ({ ...emptyDraft, city_id: current.city_id }));
      setMessage("Тариф создан.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка сохранения.");
    } finally {
      setSaving(false);
    }
  };

  const updatePlan = async (plan: PassPlan) => {
    if (savingId) return;
    setSavingId(plan.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/passes", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: plan.id,
          name: plan.name,
          description: plan.description,
          price_rub: plan.price_rub,
          hours_count: plan.hours_count,
          is_active: plan.is_active,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось обновить тариф.");
      setMessage("Изменения сохранены.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка сохранения.");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 py-8 text-sm text-white/60"><RefreshCw size={16} className="animate-spin" /> Загружаем тарифы…</div>;
  }

  return (
    <div className="space-y-7 text-white">
      <header>
        <h1 className="text-2xl font-semibold">Абонементы</h1>
        <p className="mt-1 text-sm text-white/50">Тарифы по городам. Срок действия фиксирован: один календарный месяц.</p>
      </header>

      {latePaymentReviews.length > 0 && (
        <section className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-200" />
            <div>
              <h2 className="text-base font-semibold text-amber-100">Поздняя оплата абонемента — требуется ручная проверка</h2>
              <p className="mt-1 text-sm text-white/60">Платёж поступил после истечения резерва. Система не активирует и не возвращает абонемент автоматически.</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {latePaymentReviews.map((review) => (
              <article key={review.id} className="rounded-xl border border-amber-200/15 bg-black/20 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{review.pass_name}</strong>
                  <span className="font-semibold text-amber-100">{money(Number(review.amount_rub))}</span>
                </div>
                <p className="mt-1 text-xs text-white/55">{review.city_name} · статус абонемента: {review.pass_status}</p>
                <p className="mt-1 break-all text-xs text-white/45">Пользователь: {review.user_id}</p>
                <p className="break-all text-xs text-white/45">Группа платежа: {review.id}</p>
                {review.provider_payment_id && <p className="break-all text-xs text-white/45">Платёж YooKassa: {review.provider_payment_id}</p>}
                {review.paid_at && <p className="mt-1 text-xs text-white/45">Оплата подтверждена: {new Date(review.paid_at).toLocaleString("ru-RU")}</p>}
                <p className="mt-1 break-all text-[11px] text-amber-100/65">{review.failure_reason}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-base font-semibold">Создать тариф</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-white/55">Город
            <select value={draft.city_id} onChange={(event) => setDraft((current) => ({ ...current, city_id: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#101326] px-3 text-sm text-white">
              <option value="">Выберите город</option>
              {cities.filter((city) => city.is_active).map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-white/55">Название
            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={120} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#101326] px-3 text-sm text-white" />
          </label>
          <label className="text-xs text-white/55">Цена, ₽
            <input type="number" min="1" step="1" value={draft.price_rub} onChange={(event) => setDraft((current) => ({ ...current, price_rub: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#101326] px-3 text-sm text-white" />
          </label>
          <label className="text-xs text-white/55">Количество часов
            <input type="number" min="1" max="1000" step="1" value={draft.hours_count} onChange={(event) => setDraft((current) => ({ ...current, hours_count: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#101326] px-3 text-sm text-white" />
          </label>
          <label className="text-xs text-white/55 md:col-span-2">Описание
            <textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={2} maxLength={1000} className="mt-1 w-full rounded-xl border border-white/10 bg-[#101326] p-3 text-sm text-white" />
          </label>
        </div>
        <button type="button" onClick={() => void createPlan()} disabled={saving || !draft.city_id || !draft.name.trim() || !draft.price_rub || !draft.hours_count} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? <RefreshCw size={15} className="animate-spin" /> : <Plus size={15} />} Создать тариф
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Существующие тарифы</h2>
        {plans.length === 0 ? <p className="rounded-xl border border-white/10 p-4 text-sm text-white/45">Тарифы пока не созданы.</p> : plans.map((plan) => (
          <article key={plan.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="font-semibold">{plan.city_name}</h3><p className="text-xs text-white/40">{plan.validity_label}</p></div>
              <label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={plan.is_active} onChange={(event) => setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, is_active: event.target.checked } : item))} /> Активен</label>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <label className="text-xs text-white/50 md:col-span-2">Название<input value={plan.name} onChange={(event) => setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, name: event.target.value } : item))} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#101326] px-3 text-sm text-white" /></label>
              <label className="text-xs text-white/50">Цена, ₽<input type="number" min="1" value={plan.price_rub} onChange={(event) => setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, price_rub: Number(event.target.value) } : item))} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#101326] px-3 text-sm text-white" /></label>
              <label className="text-xs text-white/50">Часы<input type="number" min="1" max="1000" value={plan.hours_count} onChange={(event) => setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, hours_count: Number(event.target.value) } : item))} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#101326] px-3 text-sm text-white" /></label>
              <label className="text-xs text-white/50 md:col-span-4">Описание<textarea value={plan.description || ""} onChange={(event) => setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, description: event.target.value } : item))} rows={2} className="mt-1 w-full rounded-lg border border-white/10 bg-[#101326] p-3 text-sm text-white" /></label>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-white/40">{money(plan.price_rub)} · {plan.hours_count} ч. · 1 календарный месяц</p>
              <button type="button" onClick={() => void updatePlan(plan)} disabled={Boolean(savingId)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-violet-400/30 px-3 text-xs text-violet-100 disabled:opacity-50">
                {savingId === plan.id ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />} Сохранить
              </button>
            </div>
          </article>
        ))}
      </section>

      {(error || message) && <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${error ? "border-red-400/20 bg-red-400/[0.06] text-red-100" : "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100"}`}>{error ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}{error || message}</div>}
    </div>
  );
}
