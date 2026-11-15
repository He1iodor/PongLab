"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, CalendarDays, CheckCircle2, Clock3, Loader2, X } from "lucide-react";

type Studio = { id: string; name: string; address: string | null; timezone: string };
type Slot = { start_at: string; end_at: string; duration_minutes: number; price_rub: number; available_tables: Array<{ id: string; name: string }> };
type Props = { bookingId: string; startAt: string; studioId: string | null; timezone: string; sourcePrice: number; onComplete: () => void };

function localDateInZone(value: Date | string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value instanceof Date ? value : new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}
function money(value: number) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value); }
function formatSlot(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: timezone || "Europe/Moscow" }).format(new Date(value));
}

export default function BookingTransferAction({ bookingId, startAt, studioId, timezone, sourcePrice, onComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [studioLoading, setStudioLoading] = useState(false);
  const [studioIdSelected, setStudioIdSelected] = useState(studioId || "");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"info" | "error" | "success">("info");
  const [operationId, setOperationId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [refundPending, setRefundPending] = useState(false);

  const startMs = Date.parse(startAt);
  const hoursUntilStart = (startMs - Date.now()) / 3600000;
  const canSelfTransfer = Number.isFinite(startMs) && startMs > Date.now() && hoursUntilStart >= 2;
  const within24Hours = hoursUntilStart <= 24;
  const sourceCalendarDate = localDateInZone(startAt, timezone);

  useEffect(() => {
    if (!open || studios.length > 0) return;
    let cancelled = false;
    setStudioLoading(true);
    fetch("/api/studios", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Не удалось загрузить список клубов.");
        return Array.isArray(result.studios) ? result.studios as Studio[] : [];
      })
      .then((items) => {
        if (cancelled) return;
        setStudios(items);
        const initial = items.some((item) => item.id === studioId) ? (studioId as string) : (items[0]?.id || "");
        setStudioIdSelected(initial);
        const target = items.find((item) => item.id === initial);
        if (target) setDate(localDateInZone(new Date(), target.timezone));
      })
      .catch((error) => {
        if (!cancelled) { setMessage(error instanceof Error ? error.message : "Ошибка загрузки клубов."); setMessageKind("error"); }
      })
      .finally(() => { if (!cancelled) setStudioLoading(false); });
    return () => { cancelled = true; };
  }, [open, studios.length, studioId]);

  const selectedStudio = studios.find((studio) => studio.id === studioIdSelected);
  const targetTimezone = selectedStudio?.timezone || "Europe/Moscow";

  useEffect(() => {
    if (!open || !studioIdSelected || !date) return;
    let cancelled = false;
    setSlotsLoading(true); setSlots([]); setSelectedSlot(""); setSelectedTable("");
    const params = new URLSearchParams({ studio_id: studioIdSelected, date, duration_minutes: "60" });
    fetch("/api/availability?" + params.toString(), { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Не удалось загрузить свободное время.");
        return Array.isArray(result.slots) ? result.slots as Slot[] : [];
      })
      .then((items) => {
        if (cancelled) return;
        const eligible = items.filter((slot) => slot.duration_minutes === 60 && slot.available_tables?.length > 0 &&
          (!within24Hours || localDateInZone(slot.start_at, timezone) === sourceCalendarDate));
        setSlots(eligible);
        if (!eligible.length) {
          setMessage(within24Hours
            ? "В этот день нет свободных часовых слотов. В течение последних 24 часов перенос возможен только на календарную дату исходного клуба."
            : "На выбранную дату нет свободных часовых слотов.");
          setMessageKind("info");
        } else setMessage("");
      })
      .catch((error) => {
        if (!cancelled) { setMessage(error instanceof Error ? error.message : "Ошибка загрузки слотов."); setMessageKind("error"); }
      })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [open, studioIdSelected, date, within24Hours, timezone, sourceCalendarDate]);

  const slot = useMemo(() => slots.find((item) => item.start_at === selectedSlot), [slots, selectedSlot]);
  const priceDifference = slot ? slot.price_rub - sourcePrice : 0;
  const tables = slot?.available_tables ?? [];

  const chooseStudio = (value: string) => {
    setStudioIdSelected(value);
    const target = studios.find((item) => item.id === value);
    if (target) setDate(localDateInZone(new Date(), target.timezone));
    setSelectedSlot(""); setSelectedTable(""); setMessage(""); setIdempotencyKey("");
  };

  const processRefund = async (id: string) => {
    const response = await fetch("/api/account/bookings/transfer/refund", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation_id: id }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.state === "completed") {
      setRefundPending(false); setMessage("Возврат разницы подтверждён. Перенос завершён."); setMessageKind("success");
      onComplete(); setOpen(false); return;
    }
    if (response.status === 202 || result.state === "processing") {
      setRefundPending(true);
      setMessage(result.message || "YooKassa обрабатывает возврат разницы. Исходная бронь остаётся активной до подтверждения.");
      setMessageKind("info"); return;
    }
    throw new Error(result.error || "Не удалось подтвердить возврат. Исходная бронь не изменена.");
  };

  const startTransfer = async () => {
    if (!slot || !selectedTable || busy) return;
    setBusy(true); setMessage(""); setMessageKind("info");
    const key = idempotencyKey || crypto.randomUUID();
    setIdempotencyKey(key);
    try {
      const response = await fetch("/api/account/bookings/transfer", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId, target_table_id: selectedTable, target_start_at: slot.start_at, idempotency_key: key }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось подготовить перенос.");
      if (result.state === "completed") {
        setMessage("Перенос выполнен."); setMessageKind("success"); onComplete(); setOpen(false); return;
      }
      if (result.state === "awaiting_payment" && typeof result.payment_group_id === "string") {
        const paymentResponse = await fetch("/api/payments/create", {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment_group_id: result.payment_group_id }),
        });
        const payment = await paymentResponse.json().catch(() => ({}));
        if (!paymentResponse.ok) throw new Error(payment.error || "Не удалось создать доплату. Исходная бронь сохранена.");
        if (payment.state === "succeeded") {
          setMessage("Доплата подтверждена. Перенос завершён."); setMessageKind("success"); onComplete(); setOpen(false); return;
        }
        if (typeof payment.confirmation_url !== "string" || !payment.confirmation_url.startsWith("https://")) {
          throw new Error("Платёж создан, но YooKassa не вернула корректную ссылку. Проверьте операцию в личном кабинете.");
        }
        window.location.assign(payment.confirmation_url); return;
      }
      if (result.state === "processing" && typeof result.operation_id === "string") {
        setOperationId(result.operation_id); await processRefund(result.operation_id); return;
      }
      throw new Error("Сервер вернул неизвестное состояние переноса. Обновите бронирования.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить перенос."); setMessageKind("error");
    } finally { setBusy(false); }
  };

  const retryRefund = async () => {
    if (!operationId || busy) return;
    setBusy(true);
    try { await processRefund(operationId); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось проверить возврат."); setMessageKind("error"); }
    finally { setBusy(false); }
  };

  if (!canSelfTransfer) return null;

  return <>
    <button type="button" onClick={() => { setOpen(true); setMessage(""); setMessageKind("info"); }}
      className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border border-[#A77BFF]/35 bg-[#8F5BFF]/10 px-4 text-sm font-semibold text-[#D8C5FF] transition hover:bg-[#8F5BFF]/20">
      <ArrowLeftRight size={15}/>Перенести бронирование
    </button>
    {open && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/75 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="Перенос бронирования">
      <div className="my-auto w-full max-w-xl rounded-2xl border border-white/10 bg-[#111427] p-5 text-white shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Перенос бронирования</h2><p className="mt-1 text-xs leading-5 text-white/50">Выберите любой активный клуб, свободный стол и часовой слот. Продолжительность — ровно 60 минут.</p></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть" className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white"><X size={18}/></button>
        </div>
        {studioLoading ? <div className="flex items-center gap-2 py-8 text-sm text-white/60"><Loader2 size={17} className="animate-spin"/>Загружаем клубы…</div> :
        <div className="mt-5 space-y-4">
          <label className="block"><span className="mb-1.5 block text-xs text-white/55">Клуб</span>
            <select value={studioIdSelected} onChange={(event) => chooseStudio(event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#090B18] px-3 text-sm text-white">
              {studios.map((studio) => <option key={studio.id} value={studio.id}>{studio.name}{studio.address ? " — " + studio.address : ""}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1.5 flex items-center gap-2 text-xs text-white/55"><CalendarDays size={14}/>Дата клуба</span>
            <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setIdempotencyKey(""); }} className="h-11 w-full rounded-xl border border-white/10 bg-[#090B18] px-3 text-sm text-white"/>
          </label>
          {within24Hours && <p className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100/80">До начала исходной брони не более 24 часов: доступны только слоты той же календарной даты в часовом поясе исходного клуба ({sourceCalendarDate}). Ровно за 2 часа перенос разрешён.</p>}
          <div><div className="mb-2 flex items-center justify-between"><span className="text-xs text-white/55">Свободное время · 60 минут</span>{slotsLoading && <Loader2 size={15} className="animate-spin text-[#B99AFF]"/>}</div>
            {!slotsLoading && !slots.length ? <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/45">Свободных слотов нет.</p> :
            <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">{slots.map((item) =>
              <button key={item.start_at} type="button" onClick={() => { setSelectedSlot(item.start_at); setSelectedTable(""); setIdempotencyKey(""); }}
                className={"rounded-xl border p-3 text-left text-xs transition " + (selectedSlot === item.start_at ? "border-[#A77BFF] bg-[#8F5BFF]/20 text-white" : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]")}>
                <span className="block font-semibold">{formatSlot(item.start_at, targetTimezone)}</span><span className="mt-1 block text-white/50">{money(item.price_rub)}</span>
              </button>)}</div>}
          </div>
          {slot && <label className="block"><span className="mb-1.5 block text-xs text-white/55">Стол</span>
            <select value={selectedTable} onChange={(event) => { setSelectedTable(event.target.value); setIdempotencyKey(""); }} className="h-11 w-full rounded-xl border border-white/10 bg-[#090B18] px-3 text-sm text-white">
              <option value="">Выберите стол</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
            </select>
          </label>}
          {slot && <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-sm">
            <div className="flex justify-between gap-3 text-white/60"><span>Текущая стоимость</span><span>{money(sourcePrice)}</span></div>
            <div className="mt-2 flex justify-between gap-3 text-white/60"><span>Новый тариф</span><span>{money(slot.price_rub)}</span></div>
            <div className="mt-2 border-t border-white/10 pt-2">
              {priceDifference > 0 ? <div className="flex justify-between gap-3 font-semibold text-amber-100"><span>Доплата</span><span>{money(priceDifference)}</span></div> :
              priceDifference < 0 ? <div className="flex justify-between gap-3 font-semibold text-emerald-200"><span>Возврат разницы</span><span>{money(Math.abs(priceDifference))}</span></div> :
              <div className="flex justify-between gap-3 font-semibold text-white"><span>Разница</span><span>Без доплаты и возврата</span></div>}
            </div>
          </div>}
          {message && <p role="status" className={"rounded-xl border p-3 text-xs leading-5 " + (messageKind === "error" ? "border-red-300/20 bg-red-300/[0.06] text-red-200" : messageKind === "success" ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200" : "border-white/10 bg-white/[0.04] text-white/65")}>{message}</p>}
          {refundPending && operationId && <button type="button" onClick={() => void retryRefund()} disabled={busy} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-200/20 bg-amber-200/10 text-sm font-semibold text-amber-100 disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin"/> : <Clock3 size={15}/>}Проверить возврат</button>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl border border-white/10 px-4 text-sm text-white/65 hover:bg-white/[0.05]">Закрыть</button>
            {!refundPending && <button type="button" onClick={() => void startTransfer()} disabled={!slot || !selectedTable || busy || slotsLoading} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#8F5BFF] px-5 text-sm font-semibold text-white hover:bg-[#A77BFF] disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}Подтвердить перенос</button>}
          </div>
        </div>}
      </div>
    </div>}
  </>;
}
