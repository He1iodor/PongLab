"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

type Studio = { id: string; name: string; address: string | null; city_id: string; timezone: string };
type Slot = { start_at: string; end_at: string; duration_minutes: number; price_rub: number; available_tables: Array<{ id: string; name: string }> };

type Props = {
  bookingId: string;
  startAt: string;
  studioId: string | null;
  timezone: string;
  passCityId: string | null;
  transferDeadlineAt: string | null;
  onComplete: () => void;
};

function localDate(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Europe/Moscow",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatSlot(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: timezone || "Europe/Moscow",
  }).format(new Date(value));
}

export default function BookingPassTransferAction({
  bookingId, startAt, studioId, timezone, passCityId, transferDeadlineAt, onComplete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [targetStudioId, setTargetStudioId] = useState(studioId || "");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedStartAt, setSelectedStartAt] = useState("");
  const [loadingStudios, setLoadingStudios] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"info" | "error" | "success">("info");

  const deadlineMs = transferDeadlineAt ? Date.parse(transferDeadlineAt) : Number.NaN;
  const sourceStartMs = Date.parse(startAt);
  const canSelfTransfer = Number.isFinite(sourceStartMs) && sourceStartMs > Date.now() + 2 * 60 * 60 * 1000 && Number.isFinite(deadlineMs) && deadlineMs > Date.now();
  const selectedStudio = studios.find((studio) => studio.id === targetStudioId);
  const targetTimezone = selectedStudio?.timezone || timezone || "Europe/Moscow";
  const minimumDate = localDate(new Date(), targetTimezone);

  const availableSlots = useMemo(() => {
    const now = Date.now();
    return slots.filter((slot) => {
      const start = Date.parse(slot.start_at);
      return slot.duration_minutes === 60 &&
        Array.isArray(slot.available_tables) && slot.available_tables.length > 0 &&
        Number.isFinite(start) && start >= now + 2 * 60 * 60 * 1000 &&
        Number.isFinite(deadlineMs) && start < deadlineMs;
    });
  }, [slots, deadlineMs]);

  useEffect(() => {
    if (!open || studios.length > 0) return;
    let cancelled = false;
    setLoadingStudios(true);
    fetch("/api/studios", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Не удалось загрузить клубы.");
        return Array.isArray(result.studios) ? result.studios as Studio[] : [];
      })
      .then((items) => {
        if (cancelled) return;
        const sameCity = passCityId ? items.filter((item) => item.city_id === passCityId) : [];
        setStudios(sameCity);
        const initial = sameCity.some((item) => item.id === studioId) ? (studioId as string) : (sameCity[0]?.id || "");
        setTargetStudioId(initial);
        const target = sameCity.find((item) => item.id === initial);
        if (target) setDate(localDate(new Date(startAt), target.timezone));
      })
      .catch((error) => {
        if (!cancelled) { setMessage(error instanceof Error ? error.message : "Ошибка загрузки клубов."); setMessageKind("error"); }
      })
      .finally(() => { if (!cancelled) setLoadingStudios(false); });
    return () => { cancelled = true; };
  }, [open, studios.length, studioId, passCityId, startAt]);

  useEffect(() => {
    if (!open || !targetStudioId || !date) return;
    let cancelled = false;
    setLoadingSlots(true);
    setSlots([]);
    setSelectedStartAt("");
    const params = new URLSearchParams({ studio_id: targetStudioId, date, duration_minutes: "60" });
    fetch(`/api/availability?${params.toString()}`, { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Не удалось загрузить свободное время.");
        return Array.isArray(result.slots) ? result.slots as Slot[] : [];
      })
      .then((items) => { if (!cancelled) setSlots(items); })
      .catch((error) => { if (!cancelled) { setMessage(error instanceof Error ? error.message : "Ошибка загрузки слотов."); setMessageKind("error"); } })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [open, targetStudioId, date]);

  const submit = async () => {
    if (!canSelfTransfer || !selectedStartAt || !targetStudioId || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/bookings/transfer", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: bookingId,
          target_studio_id: targetStudioId,
          target_start_at: selectedStartAt,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось перенести бронирование.");
      if (result.state !== "completed") throw new Error("Сервер не подтвердил завершение переноса.");
      setMessage("Перенос выполнен. Час абонемента сохранён; доплаты за разницу в цене нет.");
      setMessageKind("success");
      onComplete();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка переноса.");
      setMessageKind("error");
    } finally {
      setBusy(false);
    }
  };

  if (!Number.isFinite(deadlineMs) || deadlineMs <= Date.now() || !passCityId) return null;

  return (
    <div className="mt-3">
      {!open ? (
        <button type="button" onClick={() => { setOpen(true); setMessage(""); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-violet-400/30 px-3 text-xs font-medium text-violet-100 hover:bg-violet-400/10">
          <ArrowLeftRight size={14} /> Перенести бронь
        </button>
      ) : (
        <div className="rounded-xl border border-violet-400/20 bg-violet-400/[0.05] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-white">Перенос по абонементу</h4>
              <p className="mt-1 text-xs text-white/45">Только клубы того же города. Доплата не взимается.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-white/45 hover:text-white">Закрыть</button>
          </div>

          {loadingStudios ? <p className="mt-3 flex items-center gap-2 text-xs text-white/50"><Loader2 size={13} className="animate-spin" /> Загружаем клубы…</p> : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-white/50">Клуб
                <select value={targetStudioId} onChange={(event) => { setTargetStudioId(event.target.value); const studio = studios.find((item) => item.id === event.target.value); if (studio) setDate(localDate(new Date(), studio.timezone)); }} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#101326] px-3 text-sm text-white">
                  {studios.map((studio) => <option key={studio.id} value={studio.id}>{studio.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-white/50">Дата
                <input type="date" min={minimumDate} value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#101326] px-3 text-sm text-white" />
              </label>
            </div>
          )}

          <div className="mt-4">
            <p className="text-xs font-semibold text-white/65">Доступные часовые слоты</p>
            {loadingSlots ? <p className="mt-2 flex items-center gap-2 text-xs text-white/45"><RefreshCw size={13} className="animate-spin" /> Проверяем время…</p> : availableSlots.length === 0 ? <p className="mt-2 text-xs text-white/40">Нет свободных слотов до окончания срока переноса.</p> : (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {availableSlots.map((slot) => (
                  <button key={slot.start_at} type="button" onClick={() => setSelectedStartAt(slot.start_at)} className={`rounded-lg border p-2 text-left text-xs transition ${selectedStartAt === slot.start_at ? "border-violet-400/60 bg-violet-400/15 text-white" : "border-white/10 text-white/60 hover:bg-white/[0.04]"}`}>
                    {formatSlot(slot.start_at, targetTimezone)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/45">Перенос доступен один раз. Срок — до {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: timezone || "Europe/Moscow" }).format(new Date(deadlineMs - 1))}.</p>
            <button type="button" onClick={() => void submit()} disabled={busy || !selectedStartAt || !targetStudioId} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Подтвердить перенос
            </button>
          </div>

          {message && <p className={`mt-3 rounded-lg border p-3 text-xs leading-5 ${messageKind === "error" ? "border-red-300/20 bg-red-300/[0.06] text-red-200" : messageKind === "success" ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200" : "border-white/10 text-white/60"}`}>{message}</p>}
        </div>
      )}
    </div>
  );
}
