"use client";

import { useEffect, useRef, useState } from "react";
import { X, Play } from "lucide-react";

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
    <>
      {/* BACKDROP */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
        onClick={onClose}
      >
        {/* MODAL */}
        <div
          className="
            relative
            w-[96%]
            max-w-[1800px]
            max-h-[90vh]
            overflow-y-auto
            hide-scrollbar
            rounded-3xl
            bg-[#0B0D18]
            border border-white/10
            p-12 md:p-16
            text-white
          "
          onClick={(e) => e.stopPropagation()}
        >
          {/* CLOSE */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 h-11 w-11 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center"
          >
            <X size={20} />
          </button>

          {/* TITLE */}
<div className="text-center">
  <h2 className="text-5xl md:text-7xl font-black tracking-tight">
    Начать тренироваться проще, чем кажется
  </h2>

  <p className="mt-6 text-lg md:text-xl text-white/60 max-w-4xl mx-auto leading-relaxed">
    Мы сделали процесс максимально удобным, чтобы вы могли
    сосредоточиться только на игре и прогрессе.
  </p>
</div>

          {/* STEPS */}
         <div className="mt-20 grid grid-cols-1 lg:grid-cols-5 gap-5">
  {[1, 2, 3, 4, 5].map((step) => (
    <div
      key={step}
      className="
        rounded-3xl
        bg-white/[0.04]
        border border-white/10
        p-8
        text-center
        min-h-[280px]
        flex flex-col
        justify-center
      "
    >
      <div className="text-[#8F5BFF] text-xs font-black tracking-[0.3em]">
        ШАГ {step}
      </div>

      <h3 className="mt-6 text-[30px] leading-tight font-black">
        {step === 1 && "Подходящая программа"}
        {step === 2 && "Бронирование"}
        {step === 3 && "Начало тренировки"}
        {step === 4 && "Режимы тренировки"}
        {step === 5 && "Прогресс и аналитика"}
      </h3>

      <p className="mt-5 text-white/60 text-[15px] leading-8 flex-1">
        {step === 1 &&
          "Подберите формат тренировок под свои цели: от первого знакомства с системой до регулярных занятий с расширенными возможностями и сопровождением.Каждый тариф открывает доступ к тренировкам и дополнительным функциям платформы"}

        {step === 2 &&
          "Выберите свободный слот в онлайн-календаре и запланируйте тренировку на удобное для вас время.Никаких звонков, ожидания подтверждений и переписок — вся запись происходит онлайн за несколько секунд"}

        {step === 3 &&
          "В назначенное время приходите на площадку и запускайте тренировку через личный кабинет. Робот уже готов к работе, а вам остаётся только выйти к столу и начать заниматься"}

        {step === 4 &&
          "Используйте готовые сценарии тренировок или создавайте собственные настройки подачи. Скорость, вращение, направление и частота подачи настраиваются под ваш уровень и цели. Можно выбрать конкретную точку на столе для подачи и отрабатывать конкретный удар"}

        {step === 5 &&
          "После каждой тренировки статистика сохраняется в вашем профиле. История занятий, показатели активности, точность ударов и динамика прогресса помогают видеть результаты, и двигаться вперёд системно"}
      </p>
    </div>
  ))}
</div>
        <div className="mt-20 text-center">
  <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

  <h3 className="mt-12 text-3xl md:text-4xl font-black">
    Посмотрите тренировку в действии
  </h3>

  <p className="mt-4 text-white/60 max-w-2xl mx-auto">
    За несколько минут вы увидите, как работает система,
    как проходит тренировка и какие возможности доступны игроку.
  </p>
</div>
          {/* VIDEO */}
          <div className="mt-12 relative group max-w-6xl mx-auto">
            <video
              ref={videoRef}
              className="w-full aspect-video rounded-3xl border border-white/10 bg-black"
              controls
              controlsList="nodownload"
              onContextMenu={(e) => e.preventDefault()}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            >
              <source src="/video.mp4" type="video/mp4" />
            </video>

            {/* PLAY BUTTON OVERLAY */}
            {!isPlaying && (
              <button
                onClick={handlePlay}
                className="
                  absolute inset-0
                  flex items-center justify-center
                  bg-black/40
                  rounded-3xl
                  hover:bg-black/50
                  transition
                "
              >
                <div className="h-20 w-20 rounded-full bg-[#8F5BFF] flex items-center justify-center shadow-lg hover:scale-105 transition">
                  <Play size={34} fill="white" />
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
