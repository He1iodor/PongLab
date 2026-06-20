WhyPongLabModal/
  WhyPongLabModal.tsx
  sections/
    Section1Hero.tsx
    Section2PracticeVsWait.tsx
    Section3Technique.tsx
    Section4Reps.tsx
    Section8CTA.tsx"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useCallback, useRef } from "react";

import Section1Hero from "./sections/Section1Hero";
import Section2PracticeVsWait from "./sections/Section2PracticeVsWait";
import Section3Technique from "./sections/Section3Technique";
import Section4Reps from "./sections/Section4Reps";
import Section8CTA from "./sections/Section8CTA";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function WhyPongLabModal({ open, onClose }: Props) {
  const reduceMotion = useReducedMotion();
  const backdropRef = useRef<HTMLDivElement | null>(null);

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEsc);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEsc);
    };
  }, [open, handleEsc]);

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={backdropRef}
          onClick={handleBackdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-md flex items-center justify-center p-3 md:p-6"
        >
          <motion.div
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-[1700px] h-[94vh] rounded-[32px] border border-white/10 bg-[#0B1020] overflow-hidden"
          >
            <div className="h-full overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar">

              <Section1Hero />
              <Section2PracticeVsWait />
              <Section3Technique />
              <Section4Reps />
              <Section8CTA onClose={onClose} />

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}import Image from "next/image";
import { Zap } from "lucide-react";

export default function Section1Hero() {
  return (
    <section className="min-h-[92vh] snap-start px-8 md:px-14 py-16 flex items-center">
      <div className="grid lg:grid-cols-2 gap-16 items-center w-full">

        <div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#8F5BFF]/30 bg-[#8F5BFF]/10 text-[#CDB8FF] text-sm mb-6">
            <Zap size={16} />
            Почему игроки выбирают PongLab
          </div>

          <h2 className="text-5xl md:text-7xl font-black leading-[0.95] text-white">
            Тренируйся
            <br />
            эффективнее.
            <br />
            <span className="text-[#8F5BFF]">Прогрессируй</span>
            <br />
            быстрее.
          </h2>

          <p className="mt-8 text-lg md:text-xl text-white/70 max-w-xl">
            До 10 раз больше игровых повторений за тренировку.
            Максимум практики. Максимум контроля. Максимум прогресса.
          </p>
        </div>

        <div className="relative flex justify-center">
          <div className="absolute w-[450px] h-[450px] rounded-full bg-[#8F5BFF]/20 blur-[140px]" />
          <div className="relative bg-white/5 border border-white/10 rounded-[32px] p-10 backdrop-blur-xl">
            <Image src="/bot.png" alt="robot" width={520} height={520} />
          </div>
        </div>

      </div>
    </section>
  );
}import { Users, Zap } from "lucide-react";

export default function Section2PracticeVsWait() {
  return (
    <section className="min-h-[88vh] snap-start px-8 md:px-14 py-16 flex items-center">
      <div className="grid lg:grid-cols-2 gap-8 w-full">

        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8">
          <div className="flex items-center gap-3 mb-6">
            <Users size={24} />
            <span className="text-xl font-semibold text-white">
              Обычная тренировка
            </span>
          </div>

          <div className="space-y-4 text-white/70">
            <div>Подача</div>
            <div>Пауза</div>
            <div>Объяснение</div>
            <div>Подача</div>
          </div>
        </div>

        <div className="rounded-[28px] border border-[#8F5BFF]/30 bg-[#8F5BFF]/10 p-8">
          <div className="flex items-center gap-3 mb-6">
            <Zap size={24} />
            <span className="text-xl font-semibold text-white">
              PongLab
            </span>
          </div>

          <div className="space-y-4 text-white">
            <div>Подача</div>
            <div>Подача</div>
            <div>Подача</div>
            <div>Подача</div>
          </div>
        </div>

      </div>
    </section>
  );
}import Image from "next/image";
import { Target } from "lucide-react";

export default function Section3Technique() {
  return (
    <section className="min-h-[88vh] snap-start px-8 md:px-14 py-16 flex items-center">
      <div className="grid lg:grid-cols-2 gap-10 w-full">

        <div className="relative rounded-[32px] border border-white/10 bg-white/[0.04] min-h-[420px]">
          <div className="absolute inset-0 flex items-center justify-center">
            <Image src="/bot.png" alt="robot" width={380} height={380} />
          </div>
        </div>

        <div>
          <h3 className="text-4xl md:text-6xl font-black text-white">
            Отрабатывайте
            <br />
            именно то,
            <br />
            что хотите улучшить
          </h3>

          <div className="mt-8 space-y-4">
            {["Форхенд", "Бэкхенд", "Приём", "Ноги"].map((t) => (
              <div key={t} className="flex justify-between text-white/70">
                <span>{t}</span>
                <Target className="text-[#8F5BFF]" />
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}export default function Section4Reps() {
  return (
    <section className="min-h-[88vh] snap-start px-8 md:px-14 py-16 flex items-center justify-center text-center">
      <div>
        <div className="text-[110px] md:text-[220px] font-black text-[#8F5BFF]">
          1000+
        </div>

        <h3 className="text-4xl md:text-6xl font-black text-white">
          ударов за тренировку
        </h3>
      </div>
    </section>
  );
}import Image from "next/image";
import { ArrowRight } from "lucide-react";

export default function Section8CTA({ onClose }: { onClose: () => void }) {
  return (
    <section className="min-h-[90vh] snap-start px-8 md:px-14 py-16 flex items-center">
      <div className="w-full rounded-[40px] border border-[#8F5BFF]/20 bg-gradient-to-br from-[#8F5BFF]/15 to-transparent p-10 md:p-20">

        <div className="grid lg:grid-cols-2 gap-10 items-center">

          <div>
            <h3 className="text-5xl md:text-7xl font-black text-white leading-none">
              Каждая тренировка
              <br />
              приближает вас к
              <br />
              следующему уровню
            </h3>
          </div>

          <div className="flex flex-col items-center">
            <Image src="/bot.png" alt="robot" width={420} height={420} />

            <button
              onClick={onClose}
              className="mt-8 inline-flex items-center gap-3 px-8 py-5 rounded-2xl bg-[#8F5BFF] text-white font-semibold"
            >
              Выбрать тариф
              <ArrowRight size={18} />
            </button>
          </div>

        </div>

      </div>
    </section>
  );
}
