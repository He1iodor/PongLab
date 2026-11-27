"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  RefreshCw,
  WalletCards,
} from "lucide-react";

type Pass = {
  id: string;
  plan_id: string | null;
  city_id: string;
  city_name: string;
  plan_name_snapshot: string;
  plan_price_rub_snapshot: number;
  total_hours: number;
  remaining_hours: number;
  reserved_hours: number;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  purchased_at: string | null;
  purchase_local_date: string | null;
  timezone_snapshot: string | null;
  late_payment_review?: boolean;
};

type Plan = {
  id: string;
  city_id: string;
  city_name: string;
  name: string;
  description: string | null;
  price_rub: number;
  hours_count: number;
  validity_label: string;
  timezone: string | null;
};

type ApiData = { passes: Pass[]; plans: Plan[] };

type PurchaseKeyMap = Record<string, string>;

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function lastValidDate(value: string | null, timezone: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  // Pass expires_at is the start of the day after the final valid local date.
  date.setTime(date.getTime() - 1);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: timezone || "Europe/Moscow",
  }).format(date);
}

function statusText(pass: Pass) {
  if (pass.late_payment_review) return "Платёж требует ручной проверки";
  if (pass.status === "pending_payment") return "Ожидает оплаты";
  if (pass.status === "active") return "Действует";
  if (pass.status === "exhausted") return "Часы использованы";
  if (pass.status === "expired") return "Срок истёк";
  if (pass.status === "cancelled") return "Покупка отменена";
  return pass.status;
}

export default function AccountPassesPanel() {
  const [data, setData] = useState<ApiData>({ passes: [], plans: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null);
  const [requestKeys, setRequestKeys] = useState<PurchaseKeyMap>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/account/passes", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Не удалось загрузить абонементы.");
      }
      setData({
        passes: Array.isArray(result.passes) ? result.passes : [],
        plans: Array.isArray(result.plans) ? result.plans : [],
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки абонементов.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const plansByCity = useMemo(() => {
    const grouped = new Map<string, { cityName: string; plans: Plan[] }>();
    for (const plan of data.plans) {
      const current: { cityName: string; plans: Plan[] } = grouped.get(plan.city_id) ?? {
        cityName: plan.city_name,
        plans: [] as Plan[],
      };
      current.plans.push(plan);
      grouped.set(plan.city_id, current);
    }
    return [...grouped.entries()];
  }, [data.plans]);

  const purchase = async (plan: Plan) => {
    if (buyingPlanId) return;
    setBuyingPlanId(plan.id);
    setError("");
    setMessage("");

    const requestKey = requestKeys[plan.id] || crypto.randomUUID();
    setRequestKeys((current) => ({ ...current, [plan.id]: requestKey }));

    try {
      const orderResponse = await fetch("/api/account/passes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: plan.id, request_key: requestKey }),
      });
      const order = await orderResponse.json().catch(() => ({}));

      if (!orderResponse.ok) {
        if (orderResponse.status === 409) {
          setRequestKeys((current) => {
            const next = { ...current };
            delete next[plan.id];
            return next;
          });
        }
        throw new Error(order.error || "Не удалось создать заказ абонемента.");
      }

      if (order.state === "succeeded") {
        setMessage("Абонемент уже активирован.");
        setRequestKeys((current) => {
          const next = { ...current };
          delete next[plan.id];
          return next;
        });
        await load();
        return;
      }

      if (typeof order.payment_group_id !== "string") {
        throw new Error("Сервер не вернул идентификатор платежа.");
      }

      const paymentResponse = await fetch("/api/payments/create", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_group_id: order.payment_group_id }),
      });
      const payment = await paymentResponse.json().catch(() => ({}));

      if (!paymentResponse.ok) {
        throw new Error(payment.error || "Не удалось начать оплату абонемента.");
      }

      if (payment.state === "succeeded") {
        const returnTo = window.location.pathname.startsWith("/maxapp")
          ? "/maxapp?tab=passes"
          : window.location.pathname.startsWith("/miniapp")
            ? "/miniapp?tab=passes"
            : "/account?tab=passes";
        window.location.assign(returnTo);
        return;
      }

      if (payment.state !== "pending" || typeof payment.confirmation_url !== "string") {
        throw new Error("Платёжный сервис не вернул ссылку для оплаты.");
      }

      const paymentUrl = new URL(payment.confirmation_url);
      if (paymentUrl.protocol !== "https:") {
        throw new Error("Получена небезопасная ссылка оплаты.");
      }
      window.location.assign(paymentUrl.toString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось купить абонемент.");
    } finally {
      setBuyingPlanId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8 text-sm text-white/60">
        <RefreshCw size={18} className="animate-spin" />
        Загружаем абонементы…
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Мои абонементы</h2>
            <p className="mt-1 text-sm text-white/50">
              Часы можно использовать в активных клубах одного города.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-white/65 hover:bg-white/[0.06]"
          >
            <RefreshCw size={14} /> Обновить
          </button>
        </div>

        {data.passes.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/50">
            Пока нет купленных абонементов.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.passes.map((pass) => (
              <article key={pass.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-white">
                      <WalletCards size={17} className="text-violet-300" />
                      <h3 className="font-semibold">{pass.plan_name_snapshot}</h3>
                    </div>
                    <p className="mt-1 text-xs text-white/45">{pass.city_name}</p>
                  </div>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/60">
                    {statusText(pass)}
                  </span>
                </div>

                {pass.late_payment_review && (
                  <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100">
                    YooKassa подтвердила платёж после истечения резерва. Абонемент не активирован автоматически и ожидает ручной проверки администрацией. Повторно оплачивать этот тариф не нужно.
                  </div>
                )}

                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-white/45">Доступно часов</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
                      {pass.remaining_hours}
                      <span className="ml-1 text-sm font-normal text-white/45">доступно / {pass.total_hours}</span>
                    </p>
                  </div>
                  <div className="text-right text-xs text-white/50">
                    <p>Остаток: {pass.remaining_hours} ч.</p>
                    <p>Зарезервировано: {pass.reserved_hours} ч.</p>
                    <p className="mt-1">{money(pass.plan_price_rub_snapshot)}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-xs text-white/50">
                  <CalendarDays size={14} />
                  {pass.late_payment_review
                    ? "Срок действия не начат — ожидает проверки"
                    : pass.expires_at
                      ? `Действует до конца ${lastValidDate(pass.expires_at, pass.timezone_snapshot)}`
                      : "Срок действия начнётся после подтверждения оплаты"}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-white">Купить абонемент</h2>
          <p className="mt-1 text-sm text-white/50">
            Срок действия — один календарный месяц. После покупки возврат не предусмотрен.
          </p>
        </div>

        {plansByCity.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/50">
            Сейчас нет доступных тарифов абонементов.
          </div>
        ) : (
          <div className="space-y-5">
            {plansByCity.map(([cityId, group]) => (
              <div key={cityId}>
                <h3 className="mb-3 text-sm font-semibold text-white/75">{group.cityName}</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {group.plans.map((plan) => (
                    <article key={plan.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-white">{plan.name}</h4>
                          {plan.description && <p className="mt-1 text-xs leading-5 text-white/50">{plan.description}</p>}
                        </div>
                        <span className="text-lg font-semibold text-white">{money(plan.price_rub)}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-white/55">
                        <span className="inline-flex items-center gap-1.5"><Clock3 size={13} /> {plan.hours_count} часов</span>
                        <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} /> {plan.validity_label}</span>
                      </div>
                      {(() => {
                        const reviewPending = data.passes.some((pass) => pass.late_payment_review && pass.plan_id === plan.id);
                        return (
                      <button
                        type="button"
                        onClick={() => void purchase(plan)}
                        disabled={Boolean(buyingPlanId) || reviewPending}
                        className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {buyingPlanId === plan.id ? <RefreshCw size={15} className="animate-spin" /> : <WalletCards size={15} />}
                        {reviewPending ? "Покупка на проверке" : "Купить абонемент"}
                      </button>
                        );
                      })()}
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {(error || message) && (
        <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${error ? "border-red-400/20 bg-red-400/[0.06] text-red-100" : "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100"}`}>
          {error ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
          <span>{error || message}</span>
        </div>
      )}
    </div>
  );
}
