"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { RefreshCw, Save, UserRound } from "lucide-react";

type Profile = {
  phone: string;
  full_name: string;
};

export default function AccountProfilePanel() {
  const [profile, setProfile] = useState<Profile>({ phone: "", full_name: "" });
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/account/profile", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось загрузить профиль.");
      const next = {
        phone: String(result.profile?.phone ?? ""),
        full_name: String(result.profile?.full_name ?? ""),
      };
      setProfile(next);
      setName(next.full_name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки профиля.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось сохранить профиль.");
      setProfile((current) => ({ ...current, full_name: result.full_name }));
      setName(result.full_name);
      setSuccess("Имя сохранено.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка сохранения.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-3 py-8 text-sm text-white/60"><RefreshCw className="animate-spin" size={18} />Загружаем профиль...</div>;
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#6B30CE]/20 text-[#B99AFF]"><UserRound size={21} /></span>
        <div><h2 className="text-lg font-semibold text-white">Личные данные</h2><p className="text-sm text-white/50">Имя можно изменить. Телефон подтверждён авторизацией по звонку.</p></div>
      </div>
      <form onSubmit={save} className="max-w-xl space-y-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <div>
          <label htmlFor="account-full-name" className="mb-2 block text-sm text-white/75">Имя</label>
          <input id="account-full-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required placeholder="Как к вам обращаться" className="h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-white outline-none focus:border-[#8F5BFF]" />
          <p className="mt-2 text-xs text-white/40">От 2 до 80 символов.</p>
        </div>
        <div>
          <label htmlFor="account-phone" className="mb-2 block text-sm text-white/75">Подтверждённый телефон</label>
          <input id="account-phone" value={profile.phone} readOnly className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.025] px-4 text-white/55 outline-none" />
          <p className="mt-2 text-xs text-white/40">Изменение номера не выполняется через эту форму.</p>
        </div>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {success && <p role="status" className="text-sm text-emerald-300">{success}</p>}
        <button type="submit" disabled={saving || name.trim().length < 2 || name.trim().length > 80} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#7540D8] px-5 text-sm font-semibold text-white hover:bg-[#8755EA] disabled:opacity-50">
          {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? "Сохраняем..." : "Сохранить имя"}
        </button>
      </form>
    </section>
  );
}
