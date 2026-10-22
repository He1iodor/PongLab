
"use client";

import { useEffect, useState } from "react";
import { X, Phone } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function PersonalAccountModal({
  open,
  onClose,
}: Props) {
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center
                 bg-black/75 px-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        className="relative w-full max-w-md rounded-3xl
                   border border-white/10 bg-[#0D1022]
                   p-7 text-white shadow-2xl sm:p-9"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute right-5 top-5 rounded-xl p-2
                     text-white/60 transition hover:bg-white/10
                     hover:text-white"
        >
          <X size={21} />
        </button>

        <div className="mb-6 flex h-14 w-14 items-center justify-center
                        rounded-2xl border border-purple-400/20
                        bg-purple-500/15 text-purple-300">
          <Phone size={26} />
        </div>

        <p className="mb-2 text-sm font-medium text-purple-300">
          PONGLAB
        </p>

        <h2
          id="account-title"
          className="mb-3 text-2xl font-bold sm:text-3xl"
        >
          Личный кабинет
        </h2>

        <p className="mb-7 text-sm leading-6 text-white/60">
          Введите номер телефона, чтобы войти или создать аккаунт.
          Подтверждение будет выполнено звонком.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            // Подключим SMS.RU на следующем этапе.
          }}
        >
          <label
            htmlFor="account-phone"
            className="mb-2 block text-sm text-white/80"
          >
            Номер телефона
          </label>

          <input
            id="account-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+7 999 123-45-67"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
            className="w-full rounded-2xl border border-white/10
                       bg-white/[0.04] px-4 py-4 text-base
                       outline-none transition
                       placeholder:text-white/30
                       focus:border-purple-400"
          />

          <button
            type="submit"
            className="mt-5 w-full rounded-2xl bg-gradient-to-r
                       from-[#6B30CE] to-[#8F5BFF] px-5 py-4
                       font-semibold transition hover:brightness-110"
          >
            Продолжить
          </button>
        </form>

        <p className="mt-5 text-center text-xs leading-5 text-white/40">
          Продолжая, вы соглашаетесь с условиями использования
          сервиса и обработкой персональных данных.
        </p>
      </div>
    </div>
  );
}
