"use client";

import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function HowItWorksModal({
  open,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="
      fixed
      inset-0
      z-[999]
      flex
      items-center
      justify-center
      bg-black/70
      backdrop-blur-xl
      p-4
      "
    >
      <div
        className="
        relative
        w-full
        max-w-6xl
        rounded-[40px]
        border
        border-white/10
        bg-[#0D1020]
        p-8
        md:p-12
        shadow-[0_0_120px_rgba(107,48,206,.25)]
        "
      >
        <button
          onClick={onClose}
          className="
          absolute
          right-6
          top-6
          flex
          h-12
          w-12
          items-center
          justify-center
          rounded-xl
          bg-white/5
          hover:bg-white/10
          "
        >
          <X />
        </button>

        <h2
          className="
          text-4xl
          md:text-6xl
          font-black
          "
        >
          Как работает PongLab
        </h2>

        <p
          className="
          mt-4
          text-white/60
          max-w-2xl
          "
        >
          Роботизированная система тренировок,
          аналитики и развития игровых навыков.
        </p>

        <div
          className="
          mt-10
          aspect-video
          rounded-3xl
          border
          border-white/10
          bg-white/5
          flex
          items-center
          justify-center
          text-white/50
          "
        >
          ВИДЕО БУДЕТ ЗДЕСЬ
        </div>

        <div
          className="
          mt-10
          grid
          md:grid-cols-3
          gap-6
          "
        >
          <div className="rounded-3xl bg-white/5 p-6">
            <div className="text-[#8F5BFF] font-bold">
              ШАГ 1
            </div>

            <h3 className="mt-3 text-xl font-bold">
              Анализ уровня
            </h3>

            <p className="mt-2 text-white/60">
              Система определяет текущий уровень
              игрока.
            </p>
          </div>

          <div className="rounded-3xl bg-white/5 p-6">
            <div className="text-[#8F5BFF] font-bold">
              ШАГ 2
            </div>

            <h3 className="mt-3 text-xl font-bold">
              Персональная программа
            </h3>

            <p className="mt-2 text-white/60">
              Формируется индивидуальная тренировка.
            </p>
          </div>

          <div className="rounded-3xl bg-white/5 p-6">
            <div className="text-[#8F5BFF] font-bold">
              ШАГ 3
            </div>

            <h3 className="mt-3 text-xl font-bold">
              Аналитика
            </h3>

            <p className="mt-2 text-white/60">
              Сохраняются данные и отслеживается прогресс.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}