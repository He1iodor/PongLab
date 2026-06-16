"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Play,
  Calendar,
  BarChart3,
  Rocket,
  Target,
  UserCheck,
} from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

const steps = [
  {
    icon: UserCheck,
    number: "01",
    title: "Выберите программу",
    text: "Подберите тариф под свои цели и уровень подготовки.",
  },
  {
    icon: Calendar,
    number: "02",
    title: "Забронируйте время",
    text: "Выберите свободный слот в календаре и подтвердите тренировку.",
  },
  {
    icon: Rocket,
    number: "03",
    title: "Получите доступ",
    text: "Система автоматически активирует площадку к вашему приходу.",
  },
  {
    icon: Target,
    number: "04",
    title: "Тренируйтесь",
    text: "Используйте готовые сценарии или собственные режимы подачи.",
  },
  {
    icon: BarChart3,
    number: "05",
    title: "Отслеживайте прогресс",
    text: "Анализируйте статистику и результаты каждой тренировки.",
  },
];

const features = [
  "Онлайн-бронирование",
  "Автоматический доступ",
  "Умный робот для тренировок",

  "Индивидуальные режимы подачи",
  "Автоматический сбор мячей",
  "Парная игра и спарринги",

  "Турниры выходного дня",
  "Личная статистика",
  "Поддержка тренера",
];

export default function HowItWorksModal({
  open,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => {
  setMounted(true);
}, 10);

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEsc);

    return () => {
      setMounted(false);
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
     className={`
relative
w-[96%]
max-w-[1800px]
max-h-[92vh]
overflow-y-auto
rounded-[36px]
border
border-white/10
bg-[#0B0D18]
text-white
p-8
lg:p-14
hide-scrollbar
transition-all
duration-500
${
  mounted
    ? "opacity-100 scale-100 translate-y-0"
    : "opacity-0 scale-95 translate-y-8"
}
`}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
       className={`
relative
w-[96%]
max-w-[1800px]
max-h-[92vh]
overflow-y-auto
rounded-[36px]
border
border-white/10
bg-[#0B0D18]
text-white
p-8
lg:p-14
hide-scrollbar
transition-all
duration-500
${
mounted
  ? "opacity-100 scale-100 translate-y-0"
  : "opacity-0 scale-95 translate-y-8"
}
`}
      >
        <button
          onClick={onClose}
          className="
group
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
transition-all
hover:border-[#8F5BFF]/40
hover:bg-white/10
hover:shadow-[0_0_25px_rgba(143,91,255,.25)]
"
        >
          <X
  size={20}
  className="
    transition
    group-hover:text-[#8F5BFF]
  "
/>
        </button>

        {/* HERO */}

        <div className="grid lg:grid-cols-[1fr_minmax(500px,700px)] gap-20 items-start">

          {/* LEFT */}

          <div>

            <div
              className="
                inline-flex
                items-center
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

            <h2
              className="
                mt-8
                text-5xl
                lg:text-7xl
                font-black
                leading-[0.95]
              "
            >
              Начать
              <br />
              тренироваться
              <br />
              <span className="text-[#8F5BFF]">
                проще чем кажется
              </span>
            </h2>

            <p
              className="
                mt-8
                max-w-[720px]
                text-lg
                leading-8
                text-white/60
              "
            >
              Мы полностью автоматизировали процесс записи,
              доступа и проведения тренировок, чтобы вы
              сосредоточились исключительно на игре,
              развитии техники и достижении результата.
            </p>

          </div>

          {/* VIDEO */}

          <div className="relative mt-20">

            <div
              className="
                absolute
                -inset-12
                rounded-full
                bg-[#8F5BFF]/20
                blur-[140px]
                pointer-events-none
              "
            />

            <div
              className="
                relative
                overflow-hidden
                rounded-[32px]
                border
                border-white/10
                bg-white/5
              "
            >
              <video
 className="
w-full
max-w-full
aspect-video
object-cover
 "
>
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
                      shadow-[0_0_80px_rgba(143,91,255,.9)]
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

        {/* FEATURES */}
<div
  className="
    absolute
    inset-0
    opacity-0
    group-hover:opacity-100
    transition
    bg-[radial-gradient(circle_at_top,rgba(143,91,255,.12),transparent_70%)]
  "
/>
        <div className="mt-14">

          <h3
 className="
 text-3xl
 lg:text-4xl
 font-black
 text-center
 text-white
 mb-8
 "
>
            Всё, что нужно для роста в одном месте
          </h3>

          <div className="grid md:grid-cols-3 gap-5">

            {features.map((item) => (
             <div
  key={item}
  className="
  group
  relative
  overflow-hidden
  flex
  items-center
  gap-3
  rounded-2xl
  border
  border-white/10
  bg-white/5
  px-5
  py-5
  backdrop-blur-xl
  transition-all
  hover:border-[#8F5BFF]/40
  hover:-translate-y-1
"
>
                <div
                  className="
                    h-8
                    w-8
                    rounded-full
                    border
                    border-[#8F5BFF]/30
                    bg-[#8F5BFF]/10
                    flex
                    items-center
                    justify-center
                    shrink-0
                  "
                >
                  ✓
                </div>

                <span
                  className="
                    text-white/90
                    font-medium
                  "
                >
                  {item}
                </span>
              </div>
            ))}
          </div>

        </div>
                {/* TIMELINE */}

        <div className="mt-24 hidden xl:flex items-center">

          {steps.map((step, index) => (
            <div
              key={step.number}
              className="flex items-center flex-1"
            >
              <div
                className="
                  h-16
                  w-16
                  rounded-full
                  border
                  border-[#8F5BFF]/30
                  bg-[#8F5BFF]/10
                  flex
                  items-center
                  justify-center
                  shrink-0
                "
              >
                <step.icon
                  size={26}
                  className="text-[#8F5BFF]"
                />
              </div>

              {index !== steps.length - 1 && (
                <div className="flex-1 relative mx-4">

                  <div
                    className="
                      absolute
                      top-1/2
                      left-0
                      right-0
                      h-[1px]
                      -translate-y-1/2
                      bg-gradient-to-r
                      from-[#8F5BFF]/60
                      via-white/10
                      to-[#8F5BFF]/60
                    "
                  />

                  <div
                    className="
                      absolute
                      left-1/2
                      top-1/2
                      -translate-x-1/2
                      -translate-y-1/2
                      h-8
                      w-8
                      rounded-full
                      bg-[#0B0D18]
                      border
                      border-[#8F5BFF]/20
                      flex
                      items-center
                      justify-center
                      text-[#8F5BFF]
                      text-sm
                    "
                  >
                    ✦
                  </div>

                </div>
              )}
            </div>
          ))}

        </div>

        {/* STEPS */}

        <div
          className="
            mt-14
            grid
            md:grid-cols-2
            xl:grid-cols-5
            gap-6
          "
        >
          {steps.map((step) => (
            <div
              key={step.number}
              className="
                group
                relative
                overflow-hidden
                rounded-[28px]
                border
                border-white/10
                bg-white/5
                backdrop-blur-xl
                p-7
                transition-all
                hover:border-[#8F5BFF]/40
                hover:-translate-y-1
              "
            >
              <div
                className="
                  absolute
                  inset-0
                  opacity-0
                  group-hover:opacity-100
                  transition
                  bg-[radial-gradient(circle_at_top,rgba(143,91,255,.12),transparent_70%)]
                "
              />

              <div className="relative">

                <div
                  className="
                    text-[#8F5BFF]
                    text-lg
                    font-black
                  "
                >
                  {step.number}
                </div>

                <h3
                  className="
                    mt-4
                    text-xl
                    font-bold
                    leading-tight
                  "
                >
                  {step.title}
                </h3>

                <p
                  className="
                    mt-4
                    text-white/60
                    leading-7
                  "
                >
                  {step.text}
                </p>

              </div>

            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
