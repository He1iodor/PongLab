"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

const steps = [
  {
    title: "Подходящая программа",
    text:
      "Подберите формат тренировок под свои цели: от первого знакомства до регулярных занятий с расширенными возможностями и сопровождением. Каждый тариф открывает доступ к тренировкам и дополнительным функциям платформы.",
  },
  {
    title: "Бронирование",
    text:
      "Выберите свободный слот в онлайн-календаре и запланируйте тренировку. Вся запись происходит онлайн за несколько секунд без звонков и ожидания.",
  },
  {
    title: "Начало тренировки",
    text:
      "В назначенное время приходите на площадку и запускайте тренировку через личный кабинет. Робот уже готов к работе.",
  },
  {
    title: "Режимы тренировки",
    text:
      "Используйте сценарии или создавайте собственные настройки подачи: скорость, вращение, направление и точка подачи.",
  },
  {
    title: "Прогресс и аналитика",
    text:
      "После тренировки статистика сохраняется в профиле: история занятий, точность ударов и динамика прогресса.",
  },
];

export default function HowItWorksModal({ open, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!open) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "auto";
    };
  }, [open, onClose]);

  if (!open) return null;

  const handlePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.play();
    setIsPlaying(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="
          relative
          w-[96%]
          max-w-[1200px]
          max-h-[90vh]
          overflow-y-auto
          snap-y snap-mandatory scroll-smooth
          rounded-3xl
          bg-[#0B0D18]
          border border-white/10
          text-white
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="sticky top-0 z-10 bg-[#0B0D18]/80 backdrop-blur p-6 border-b border-white/10">
          <h2 className="text-xl font-bold">Как это работает</h2>
        </div>

        {/* STEPS */}
        {steps.map((step, index) => (
          <section
            key={index}
            className="
              min-h-[80vh]
              flex items-center justify-center
              snap-center
              px-6
            "
          >
            <div
              className="
                max-w-3xl w-full
                rounded-3xl
                border border-white/10
                bg-white/[0.03]
                backdrop-blur-xl
                p-10 md:p-14
                transition-all duration-700
                hover:scale-[1.01]
              "
            >
              <span className="text-[#8F5BFF] font-bold">
                ШАГ {index + 1}
              </span>

              <h2 className="mt-4 text-4xl md:text-5xl font-black">
                {step.title}
              </h2>

              <p className="mt-8 text-white/70 text-lg leading-9">
                {step.text}
              </p>
            </div>
          </section>
        ))}

        {/* VIDEO */}
        <section className="min-h-[90vh] flex items-center justify-center snap-center px-6">
          <div className="w-full max-w-5xl">
            <h2 className="text-center text-5xl font-black mb-10">
              Посмотрите как это работает
            </h2>

            <div className="relative rounded-3xl overflow-hidden border border-white/10">
              <video
                ref={videoRef}
                className="w-full"
                src="/video.mp4"
              />

              {!isPlaying && (
                <button
                  onClick={handlePlay}
                  className="
                    absolute inset-0
                    flex items-center justify-center
                    bg-black/40
                    hover:bg-black/50
                    transition
                  "
                >
                  <div className="h-20 w-20 rounded-full bg-[#8F5BFF] flex items-center justify-center">
                    <Play size={36} fill="white" />
                  </div>
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
