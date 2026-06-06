"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

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
          max-w-[1400px]
          max-h-[90vh]
          overflow-y-auto
          snap-y snap-mandatory
          scroll-smooth
          rounded-3xl
          bg-[#0B0D18]
          border border-white/10
          text-white
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="sticky top-0 z-10 bg-[#0B0D18]/80 backdrop-blur border-b border-white/10 px-8 py-6">
          <h2 className="text-xl font-bold">Как это работает</h2>
        </div>

        {/* ===== STEP 1 ===== */}
        <section className="min-h-[80vh] snap-center flex items-center px-10">
          <div className="max-w-3xl">
            <span className="text-[#8F5BFF] font-bold">ШАГ 1</span>

            <h3 className="mt-6 text-[30px] leading-tight font-black">
              Подходящая программа
            </h3>

            <p className="mt-5 text-white/60 text-[15px] leading-8">
              Подберите формат тренировок под свои цели: от первого знакомства с системой до регулярных занятий с расширенными возможностями и сопровождением.Каждый тариф открывает доступ к тренировкам и дополнительным функциям платформы
            </p>
          </div>
        </section>

        {/* ===== STEP 2 ===== */}
        <section className="min-h-[80vh] snap-center flex items-center px-10">
          <div className="max-w-3xl">
            <span className="text-[#8F5BFF] font-bold">ШАГ 2</span>

            <h3 className="mt-6 text-[30px] leading-tight font-black">
              Бронирование
            </h3>

            <p className="mt-5 text-white/60 text-[15px] leading-8">
              Выберите свободный слот в онлайн-календаре и запланируйте тренировку на удобное для вас время.Никаких звонков, ожидания подтверждений и переписок — вся запись происходит онлайн за несколько секунд
            </p>
          </div>
        </section>

        {/* ===== STEP 3 ===== */}
        <section className="min-h-[80vh] snap-center flex items-center px-10">
          <div className="max-w-3xl">
            <span className="text-[#8F5BFF] font-bold">ШАГ 3</span>

            <h3 className="mt-6 text-[30px] leading-tight font-black">
              Начало тренировки
            </h3>

            <p className="mt-5 text-white/60 text-[15px] leading-8">
              В назначенное время приходите на площадку и запускайте тренировку через личный кабинет. Робот уже готов к работе, а вам остаётся только выйти к столу и начать заниматься
            </p>
          </div>
        </section>

        {/* ===== STEP 4 ===== */}
        <section className="min-h-[80vh] snap-center flex items-center px-10">
          <div className="max-w-3xl">
            <span className="text-[#8F5BFF] font-bold">ШАГ 4</span>

            <h3 className="mt-6 text-[30px] leading-tight font-black">
              Режимы тренировки
            </h3>

            <p className="mt-5 text-white/60 text-[15px] leading-8">
              Используйте готовые сценарии тренировок или создавайте собственные настройки подачи. Скорость, вращение, направление и частота подачи настраиваются под ваш уровень и цели. Можно выбрать конкретную точку на столе для подачи и отрабатывать конкретный удар
            </p>
          </div>
        </section>

        {/* ===== STEP 5 ===== */}
        <section className="min-h-[80vh] snap-center flex items-center px-10">
          <div className="max-w-3xl">
            <span className="text-[#8F5BFF] font-bold">ШАГ 5</span>

            <h3 className="mt-6 text-[30px] leading-tight font-black">
              Прогресс и аналитика
            </h3>

            <p className="mt-5 text-white/60 text-[15px] leading-8">
              После каждой тренировки статистика сохраняется в вашем профиле. История занятий, показатели активности, точность ударов и динамика прогресса помогают видеть результаты, и двигаться вперёд системно
            </p>
          </div>
        </section>

        {/* ===== VIDEO ===== */}
        <section className="min-h-[90vh] snap-center flex items-center justify-center px-10">
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
