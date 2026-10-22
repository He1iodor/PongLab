
"use client";

import { useEffect, useState } from "react";
import { X, Phone } from "lucide-react";

type PersonalAccountModalProps = {
  open: boolean;
  onClose: () => void;
};

const ANIMATION_DURATION = 500;

export default function PersonalAccountModal({
  open,
  onClose,
}: PersonalAccountModalProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [phoneDigits, setPhoneDigits] = useState("");

  // Плавное открытие и закрытие.
  useEffect(() => {
    let frame1 = 0;
    let frame2 = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (open) {
      setMounted(true);

      frame1 = requestAnimationFrame(() => {
        frame2 = requestAnimationFrame(() => {
          setVisible(true);
        });
      });
    } else {
      setVisible(false);

      timer = setTimeout(() => {
        setMounted(false);
      }, ANIMATION_DURATION);
    }

    return () => {
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
      if (timer) clearTimeout(timer);
    };
  }, [open]);

  // Блокируем прокрутку страницы, пока модальное окно открыто.
  useEffect(() => {
    if (!mounted) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  // Закрытие по Escape.
  useEffect(() => {
    if (!mounted) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mounted, onClose]);

  // Только 10 цифр после фиксированного +7.

const handlePhoneChange = (value: string) => {
  let digits = value.replace(/\D/g, "");

  if (value.trim().startsWith("+")) {
    // Если вставили номер с +, отсекаем две цифры слева.
    digits = digits.slice(2);
  } else if (value.trim().startsWith("8")) {
    // Если номер начинается с 8, отсекаем одну цифру слева.
    digits = digits.slice(1);
  }

  // В остальных случаях оставляем цифры как есть,
  // ограничивая ввод десятью цифрами.
  setPhoneDigits(digits.slice(0, 10));
};

  const isPhoneValid = phoneDigits.length === 10;

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-[visibility] duration-500 ${
        visible ? "visible" : "invisible"
      }`}
      aria-hidden={!visible}
    >
      {/* Затемнённый фон */}
      <button
        type="button"
        aria-label="Закрыть окно"
        tabIndex={visible ? 0 : -1}
        onClick={onClose}
        className={`absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm transition-opacity duration-500 motion-reduce:transition-none ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Модальное окно */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="personal-account-title"
        className={`relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-[#0D1022] p-7 text-white shadow-2xl transition-[opacity,transform] duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:p-9 ${
          visible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-8 scale-[0.88] opacity-0"
        }`}
      >
        {/* Кнопка закрытия */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          tabIndex={visible ? 0 : -1}
          className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={20} />
        </button>

        {/* Иконка телефона */}
        <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#6B30CE]/20 text-[#A77BFF]">
          <Phone size={27} strokeWidth={1.8} />
        </div>

        <div className="mb-8">
          <div className="mb-3 text-sm font-semibold tracking-[0.25em] text-[#A77BFF]">
            PongLab®
          </div>

          <h2
            id="personal-account-title"
            className="text-3xl font-semibold tracking-tight"
          >
            Личный кабинет
          </h2>

          <p className="mt-3 text-sm leading-6 text-white/60">
            Введите собственный номер телефона, чтобы войти или создать аккаунт.
            Подтверждение будет выполнено посредством звонка.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();

            if (!isPhoneValid) return;

            // Подключим отправку номера на сервер на следующем этапе.
            console.log("Телефон для авторизации:", `+7${phoneDigits}`);
          }}
        >
          <label
            htmlFor="account-phone"
            className="mb-2 block text-sm font-medium text-white/90"
          >
            Номер:
          </label>

          <div className="flex h-14 items-center overflow-hidden rounded-xl border border-white/15 bg-white/[0.04] transition-colors focus-within:border-[#8F5BFF]">
            <span
              className="flex h-full items-center border-r border-white/10 px-4 text-base text-white/80"
              aria-hidden="true"
            >
              +7
            </span>

            <input
              id="account-phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="999 123-45-67"
              value={phoneDigits}
              onChange={(event) => handlePhoneChange(event.target.value)}
              maxLength={10}
              required
              aria-describedby="phone-hint"
              className="h-full min-w-0 flex-1 bg-transparent px-4 text-base text-white outline-none placeholder:text-white/30"
            />
          </div>

          <p
            id="phone-hint"
            aria-live="polite"
            className="mt-2 min-h-5 text-xs text-white/50"
          >
            {phoneDigits.length === 0
              ? "Введите 10 цифр номера"
              : phoneDigits.length < 10
                ? `Введено ${phoneDigits.length} из 10 цифр`
                : "Номер введён полностью"}
          </p>

          <button
            type="submit"
            disabled={!isPhoneValid}
            className={`mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#6B30CE] to-[#8F5BFF] text-base font-semibold text-white transition-[opacity,transform,filter] duration-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${
              isPhoneValid ? "hover:brightness-110" : ""
            }`}
          >
            Продолжить
          </button>

          <p className="mt-5 text-center text-xs leading-5 text-white/40">
            Продолжая, вы соглашаетесь с обработкой персональных данных.
          </p>
        </form>
      </div>
    </div>
  );
}
