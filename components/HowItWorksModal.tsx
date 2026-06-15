"use client";

import { useEffect, useRef, useState } from "react";
import { X, Play, Calendar, BarChart3, Rocket, Target, UserCheck } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

const steps = [
  {
    icon: UserCheck,
    number: "01",
    title: "Выберите программу",
    text: "Подберите тариф под свои цели — от первого знакомства с системой до регулярных тренировок с расширенными возможностями."
  },
  {
    icon: Calendar,
    number: "02",
    title: "Забронируйте время",
    text: "Выберите свободный слот в календаре и забронируйте тренировку за несколько секунд."
  },
  {
    icon: Rocket,
    number: "03",
    title: "Получите доступ",
    text: "После оплаты система автоматически активирует тренировку и подготовит площадку."
  },
  {
    icon: Target,
    number: "04",
    title: "Тренируйтесь",
    text: "Используйте готовые сценарии или создавайте собственные режимы подачи."
  },
  {
    icon: BarChart3,
    number: "05",
    title: "Анализируйте прогресс",
    text: "История занятий, статистика и живые турниры между игроками помогают видеть реальные результаты."
  }
];

export default function HowItWorksModal({
  open,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!open) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.body.style.overflow = "auto";
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handlePlay = () => {
    if (!videoRef.current) return;

    videoRef.current.play();
    setIsPlaying(true);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="
          relative
          w-[96%]
          max-w-[1800px]
          max-h-[92vh]
          overflow-y-auto
          rounded-[32px]
          bg-[#0B0D18]
          border border-white/10
          text-white
          p-8 lg:p-14
        "
      >
        <button
          onClick={onClose}
          className="
            absolute
            top-8
            right-8
            h-12
            w-12
            rounded-xl
            border
            border-white/10
            bg-white/5
            flex
            items-center
            justify-center
            hover:bg-white/10
            transition
          "
        >
          <X size={20} />
        </button>

        <div className="grid lg:grid-cols-2 gap-16 items-start">

          <div>

            <div
              className="
                inline-flex
                items-center
                gap-2
                rounded-full
                border
                border-[#8F5BFF]/30
                bg-[#8F5BFF]/10
                px-4
                py-2
                text-sm
                text-[#CDB4FF]
              "
            >
              Как это работает
            </div>

            <h2 className="mt-8 text-5xl lg:text-7xl font-black leading-[0.95]">
              Начать
              <br />
              тренироваться
              <br />
              <span className="text-[#8F5BFF]">
                проще чем кажется
              </span>
            </h2>

            <p className="mt-8 text-lg leading-8 text-white/60 max-w-[650px]">
              Мы полностью автоматизировали процесс записи,
              доступа и проведения тренировок, чтобы вы
              сосредоточились только на игре и прогрессе.
            </p>

           <div className="mt-10">

  <h3 className="text-xl font-bold mb-6">
    Всё, что нужно для роста в одном месте
  </h3>

  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

    {[
  "Онлайн-бронирование",
  "Автоматический доступ",
  "Умный робот для тренировок",

  "Индивидуальные режимы подачи с точностью до точки",
  "Автоматический сбор мячей",
  "Возможность тренировки в паре либо против друг друга",

  "Турниры выходного дня между живыми игроками",
  "Статистика достижений и история занятий",
  "Поддержка тренера при необходимости или по желанию",
].map((item) => (
      <div
        key={item}
        className="
          flex
          items-center
          gap-3
          rounded-2xl
          border
          border-white/10
          bg-white/5
          px-5
          py-4
          backdrop-blur-xl
          hover:border-[#8F5BFF]/40
          hover:bg-white/[0.07]
          transition-all
        "
      >
        <div
          className="
            flex
            h-7
            w-7
            items-center
            justify-center
            rounded-full
            bg-[#8F5BFF]/15
            border
            border-[#8F5BFF]/30
            shrink-0
          "
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8F5BFF"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <span className="text-white/85 text-[15px] font-medium">
          {item}
        </span>
      </div>
    ))}

  </div>

</div>
          </div>

          <div className="relative">

  <div
    className="
      absolute
      -inset-10
      rounded-full
      bg-[#8F5BFF]/20
      blur-[120px]
      pointer-events-none
    "
  />

  <div
    className="
      relative
      overflow-hidden
      rounded-[28px]
      border
      border-white/10
      bg-white/5
    "
  >
    <video
      ref={videoRef}
      className="
        w-full
        aspect-[16/10]
        object-cover
      "
      controls={isPlaying}
    >
      <source src="/video/how-it-works.mp4" />
    </video>

    {!isPlaying && (
      <button
        onClick={handlePlay}
        className="
          absolute
          inset-0
          flex
          items-center
          justify-center
          bg-black/40
        "
      >
        <div
          className="
            h-24
            w-24
            rounded-full
            bg-[#8F5BFF]
            flex
            items-center
            justify-center
            shadow-[0_0_60px_rgba(143,91,255,.8)]
          "
        >
          <Play
            size={38}
            fill="white"
          />
        </div>
      </button>
    )}
  </div>

</div>
                <source src="/video.mp4" />
              </video>

              {!isPlaying && (
                <button
                  onClick={handlePlay}
                  className="
                    absolute
                    inset-0
                    flex
                    items-center
                    justify-center
                    bg-black/40
                  "
                >
                  <div
                    className="
                      h-24
                      w-24
                      rounded-full
                      bg-[#8F5BFF]
                      flex
                      items-center
                      justify-center
                      shadow-[0_0_60px_rgba(143,91,255,.8)]
                    "
                  >
                    <Play
                      size={38}
                      fill="white"
                    />
                  </div>
                </button>
              )}
            </div>

          </div>

        </div>

        <div className="mt-20 hidden xl:flex items-center justify-between">

          {steps.map((step, i) => (
            <div
              key={i}
              className="flex items-center"
            >
              <div
                className="
                  h-16
                  w-16
                  rounded-2xl
                  bg-[#8F5BFF]/10
                  border
                  border-[#8F5BFF]/30
                  flex
                  items-center
                  justify-center
                "
              >
                <step.icon
                  size={28}
                  className="text-[#8F5BFF]"
                />
              </div>

              {i !== steps.length - 1 && (
                <div
                  className="
                    w-24
                    h-[2px]
                    bg-gradient-to-r
                    from-[#8F5BFF]
                    to-transparent
                  "
                />
              )}
            </div>
          ))}
        </div>

        <div className="mt-16 grid md:grid-cols-2 xl:grid-cols-5 gap-6">

          {steps.map((step) => (
            <div
              key={step.number}
              className="
                rounded-3xl
                border
                border-white/10
                bg-white/5
                p-6
                backdrop-blur-xl
                hover:border-[#8F5BFF]/40
                transition
              "
            >
              <div className="text-[#8F5BFF] font-black text-xl">
                {step.number}
              </div>

              <h3 className="mt-4 text-xl font-bold">
                {step.title}
              </h3>

              <p className="mt-4 text-white/60 leading-7">
                {step.text}
              </p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
