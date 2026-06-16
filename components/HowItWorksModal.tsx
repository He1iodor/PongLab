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

export default function HowItWorksModal({ open, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;

    if (open) {
      setVisible(true);

      const run = () => {
        setMounted(true);
      };

      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(run);
      });

      document.body.style.overflow = "hidden";

      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape") handleClose();
      };

      document.addEventListener("keydown", handleEsc);

      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
        document.removeEventListener("keydown", handleEsc);
      };
    } else {
      setMounted(false);

      const t = setTimeout(() => {
        setVisible(false);
        document.body.style.overflow = "auto";
      }, 700);

      return () => clearTimeout(t);
    }
  }, [open]);

  const handleClose = () => {
    setMounted(false);

    setTimeout(() => {
      onClose();
    }, 700);
  };

  const handlePlay = () => {
    if (!videoRef.current) return;

    videoRef.current.play().catch(console.error);
    setIsPlaying(true);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xl overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 text-white">
        {/* HERO */}
        <div className="grid lg:grid-cols-[1fr_minmax(500px,700px)] gap-20 items-start">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#8F5BFF]/30 bg-[#8F5BFF]/10 px-4 py-2 text-sm text-[#CDB4FF]">
              Как это работает
            </div>

            <h2 className="mt-8 text-5xl lg:text-7xl font-black leading-[0.95]">
              Начать <br />
              тренироваться <br />
              <span className="text-[#8F5BFF]">проще чем кажется</span>
            </h2>

            <p className="mt-8 max-w-[720px] text-lg leading-8 text-white/60">
              Мы автоматизировали процесс записи, доступа и тренировок.
            </p>
          </div>

          <div className="relative mt-20">
            <div className="absolute -inset-12 rounded-full bg-[#8F5BFF]/20 blur-[140px]" />

            <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/5">
              <video ref={videoRef} className="w-full aspect-video object-cover" controls={isPlaying}>
                <source src="/video.mp4" />
              </video>

              {!isPlaying && (
                <button
                  onClick={handlePlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/40"
                >
                  <div className="h-24 w-24 rounded-full bg-[#8F5BFF] flex items-center justify-center shadow-[0_0_80px_rgba(143,91,255,.9)]">
                    <Play size={38} fill="white" />
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* FEATURES */}
        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {features.map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-5">
              <span className="text-white/90 font-medium">{item}</span>
            </div>
          ))}
        </div>

        {/* STEPS */}
        <div className="mt-14 grid md:grid-cols-2 xl:grid-cols-5 gap-6">
          {steps.map((step) => (
            <div key={step.number} className="rounded-[28px] border border-white/10 bg-white/5 p-7">
              <div className="text-[#8F5BFF] text-lg font-black">{step.number}</div>
              <h3 className="mt-4 text-xl font-bold">{step.title}</h3>
              <p className="mt-4 text-white/60">{step.text}</p>
            </div>
          ))}
        </div>

        {/* CLOSE */}
        <button onClick={handleClose} className="fixed top-6 right-6 text-white">
          <X size={28} />
        </button>
      </div>
    </div>
  );
}
