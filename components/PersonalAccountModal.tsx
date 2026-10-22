
"use client";

import { useEffect, useState } from "react";

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

  // Плавное появление и схлопывание окна.
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

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [open]);

  // Запрет прокрутки страницы, пока окно открыто.
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

  // Разрешаем вводить только 10 цифр.
  // Если пользователь вставил номер целиком с +7 или 8,
  // автоматически убираем код страны/первую цифру.
  const handlePhoneChange = (value: string) => {
    let digits = value.replace(/\D/g, "");

    if (
      digits.length > 10 &&
      (digits.startsWith("7") || digits.startsWith("8"))
    ) {
      digits = digits.slice(1);
    }

    setPhoneDigits(digits.slice(0, 10));
  };

  const isPhoneValid = phoneDigits.length === 10;

  if (!mounted) return null;

  return (
    <div
      className={[
        "fixed inset-0 z-[100] flex items-center justify-center",
        "p-4",
        "transition-[visibility] duration-500",
        visible ? "visible" : "invisible",
      ].join(" ")}
      aria-hidden={!visible}
    >
      {/* Затемнение фона */}
      <button
        type="button"
        aria-label="Закрыть окно"
        tabIndex={visible ? 0 : -1}
        onClick={onClose}
        className={[
          "absolute inset-0 h-full w-full cursor-default",
          "bg-black/60 backdrop-blur-[3px]",
          "transition-opacity duration-500",
          "[transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
          "motion-reduce:transition-none",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />

      {/* Само окно */}
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="personal-account-title"
        className={[
          "relative z-10 w-full max-w-md",
          "rounded-2xl border border-white/10",
          "bg-[#111111] p-7 text-white shadow-2xl sm:p-9",
          "transform-gpu will-change-[opacity,transform]",
          "transition-[opacity,transform] duration-500",
          "[transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
          "motion-reduce:transition-none",
          visible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-6 scale-[0.94] opacity-0",
        ].join(" ")}
      >
        {/* Кнопка закрытия */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          tabIndex={visible ? 0 : -1}
          className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full text-2xl text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white"
        >
          ×
        </button>

        <div className="mb-8">
          <div className="mb-6 text-xs font-semibold tracking-[0.3em] text-white/50">
            PONGLAB
          </div>

          <h2
            id="personal-account-title"
            className="text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Личный кабинет
          </h2>

          <p className="mt-3 text-sm leading-6 text-white/60">
            Введите номер телефона, чтобы войти или зарегистрироваться.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();

            if (!isPhoneValid) return;

            // Следующий шаг — подключение проверки через звонок SMS.RU.
            console.log("Телефон:", `+7${phoneDigits}`);
          }}
        >
          <label
            htmlFor="account-phone"
            className="mb-3 block text-lg font-medium text-white"
          >
            Номер телефона
          </label>

          <div className="flex h-14 items-center overflow-hidden rounded-xl border border-white/20 bg-white/[0.04] transition-colors duration-200 focus-within:border-white/60">
            <span
              className="flex h-full items-center border-r border-white/10 px-4 text-base text-white"
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
              className="h-full min-w-0 flex-1 bg-transparent px-4 text-base tracking-wide text-white outline-none placeholder:text-white/30"
            />
          </div>

          <div
            id="phone-hint"
            className="mt-2 min-h-5 text-sm text-white/50"
            aria-live="polite"
          >
            {phoneDigits.length === 0
              ? "Введите 10 цифр номера"
              : phoneDigits.length < 10
                ? `Осталось цифр: ${10 - phoneDigits.length}`
                : "Номер введён полностью"}
          </div>

          <button
            type="submit"
            disabled={!isPhoneValid}
            className={[
              "mt-5 flex h-14 w-full items-center justify-center rounded-xl",
              "text-base font-semibold",
              "transition-[background-color,opacity,transform] duration-300",
              "active:scale-[0.99]",
              "disabled:cursor-not-allowed disabled:opacity-35",
              isPhoneValid
                ? "bg-white text-black hover:bg-white/85"
                : "bg-white text-black",
            ].join(" ")}
          >
            Продолжить
          </button>

          <p className="mt-5 text-center text-xs leading-5 text-white/40">
            Подтверждение номера подключим следующим шагом.
          </p>
        </form>
      </section>
    </div>
  );
}
