"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import {
  X,
  ArrowRight,
  Clock3,
  Target,
  Trophy,
  Brain,
  Zap,
  BarChart3,
} from "lucide-react";
import { useEffect, useCallback, useRef, type MouseEvent } from "react";

interface WhyPongLabModalProps {
  open: boolean;
  onClose: () => void;
}

export default function WhyPongLabModal({
  open,
  onClose,
}: WhyPongLabModalProps) {
  const reduceMotion = useReducedMotion();
  const backdropRef = useRef<HTMLDivElement | null>(null);

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={backdropRef}
          onClick={handleBackdropClick}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xl flex items-center justify-center p-3 md:p-6"
        >
          <motion.div
            initial={{
              opacity: 0,
              scale: reduceMotion ? 1 : 0.96,
              y: reduceMotion ? 0 : 30,
            }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="relative w-full max-w-[1700px] h-[94vh] rounded-[36px] border border-white/10 bg-[#070A14] overflow-hidden shadow-[0_60px_180px_rgba(0,0,0,0.8)]"
          >
            {/* GLOW BACKGROUND */}
            <div className="absolute inset-0">
              <div className="absolute w-[700px] h-[700px] bg-[#8F5BFF]/20 blur-[180px] top-[-200px] left-[-200px]" />
              <div className="absolute w-[600px] h-[600px] bg-green-400/10 blur-[180px] bottom-[-200px] right-[-200px]" />
            </div>

            {/* CLOSE */}
            <button
              onClick={onClose}
              className="absolute top-6 right-6 z-50 h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition"
            >
              <X size={20} />
            </button>

            {/* SCROLL */}
            <div className="relative h-full overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar">

              {/* ========== SECTION 1 HERO ========== */}
              <section className="min-h-[92vh] snap-start flex items-center px-10 md:px-20">
                <div className="grid lg:grid-cols-2 gap-16 w-full items-center">

                  <div>
                    <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#8F5BFF]/10 border border-[#8F5BFF]/30 text-[#CDB8FF] mb-8">
                      <Zap size={16} />
                      PongLab AI Training System
                    </div>

                    <h1 className="text-6xl md:text-8xl font-black leading-[0.9] text-white">
                      Тренируйся
                      <br />
                      <span className="text-[#8F5BFF]">умнее</span>.
                      <br />
                      Бей
                      <br />
                      быстрее.
                    </h1>

                    <p className="mt-8 text-xl text-white/70 max-w-xl">
                      Робот, который превращает каждую тренировку в поток повторений без пауз и потерь времени.
                    </p>

                    <div className="mt-10 flex gap-4">
                      <div className="px-5 py-4 rounded-2xl bg-white/5 border border-white/10">
                        <div className="text-3xl text-[#8F5BFF] font-black">10x</div>
                        <div className="text-white/60 text-sm">больше ударов</div>
                      </div>

                      <div className="px-5 py-4 rounded-2xl bg-white/5 border border-white/10">
                        <div className="text-3xl text-[#8F5BFF] font-black">24/7</div>
                        <div className="text-white/60 text-sm">доступ</div>
                      </div>
                    </div>
                  </div>

                  <div className="relative flex justify-center">
                    <div className="absolute w-[500px] h-[500px] bg-[#8F5BFF]/20 blur-[160px]" />
                    <Image src="/bot.png" alt="robot" width={520} height={520} className="relative z-10" />
                  </div>

                </div>
              </section>

              {/* ========== SECTION 2 PROBLEM VS SOLUTION ========== */}
              <section className="min-h-[88vh] snap-start px-10 md:px-20 flex items-center">
                <div className="grid lg:grid-cols-2 gap-10 w-full">

                  <div className="p-10 rounded-3xl border border-white/10 bg-white/5">
                    <h3 className="text-2xl text-white mb-6">Обычная тренировка</h3>
                    <div className="space-y-3 text-white/60">
                      <div>Паузы</div>
                      <div>Ожидание подачи</div>
                      <div>Мало повторений</div>
                    </div>
                  </div>

                  <div className="p-10 rounded-3xl border border-[#8F5BFF]/30 bg-[#8F5BFF]/10">
                    <h3 className="text-2xl text-white mb-6">PongLab</h3>
                    <div className="space-y-3 text-white">
                      <div>Непрерывная подача</div>
                      <div>Поток ударов</div>
                      <div>Максимум повторений</div>
                    </div>
                  </div>

                </div>
              </section>

              {/* ========== SECTION 3 PRECISION ========== */}
              <section className="min-h-[88vh] snap-start px-10 md:px-20 flex items-center">
                <div className="grid lg:grid-cols-2 gap-12 w-full">

                  <div>
                    <h3 className="text-5xl font-black text-white leading-tight">
                      Идеальная
                      <br />
                      повторяемость
                    </h3>

                    <p className="mt-6 text-white/70">
                      Один сценарий можно повторить сотни раз без отклонений.
                    </p>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 bg-[#8F5BFF]/10 blur-[120px]" />
                    <Image src="/bot.png" alt="robot" width={420} height={420} />
                  </div>

                </div>
              </section>

              {/* ========== SECTION 4 IMPACT NUMBER ========== */}
              <section className="min-h-[88vh] snap-start flex items-center justify-center text-center">
                <div>
                  <div className="text-[160px] md:text-[260px] font-black text-[#8F5BFF] leading-none">
                    1000+
                  </div>
                  <div className="text-4xl md:text-6xl font-black text-white">
                    ударов за тренировку
                  </div>
                </div>
              </section>

              {/* ========== SECTION 5 TIME CONTROL ========== */}
              <section className="min-h-[88vh] snap-start flex items-center justify-center text-center px-10">
                <div>
                  <Clock3 className="mx-auto mb-6 text-[#8F5BFF]" size={48} />
                  <h3 className="text-5xl font-black text-white">
                    Тренируйся когда хочешь
                  </h3>
                </div>
              </section>

              {/* ========== SECTION 6 PLATFORM ========== */}
              <section className="min-h-[88vh] snap-start px-10 md:px-20 flex items-center">
                <div className="grid grid-cols-2 gap-6 w-full text-white">

                  {[BarChart3, Brain, Trophy, Zap].map((Icon, i) => (
                    <div key={i} className="p-8 rounded-2xl bg-white/5 border border-white/10">
                      <Icon className="text-[#8F5BFF] mb-4" />
                      Feature {i + 1}
                    </div>
                  ))}

                </div>
              </section>

              {/* ========== SECTION 7 COMPARISON ========== */}
              <section className="min-h-[88vh] snap-start flex items-center justify-center px-10">
                <div className="text-center text-white max-w-3xl">
                  <h3 className="text-5xl font-black">
                    PongLab + тренер
                  </h3>
                  <p className="mt-6 text-white/70">
                    Вместе дают максимальный результат.
                  </p>
                </div>
              </section>

              {/* ========== SECTION 8 CTA ========== */}
              <section className="min-h-[90vh] snap-start flex items-center px-10 md:px-20">
                <div className="w-full rounded-[40px] border border-[#8F5BFF]/20 bg-gradient-to-br from-[#8F5BFF]/15 to-transparent p-10 md:p-20 grid lg:grid-cols-2 gap-10 items-center">

                  <div>
                    <h3 className="text-6xl font-black text-white leading-tight">
                      Готов начать
                      <br />
                      новый уровень?
                    </h3>
                  </div>

                  <div className="flex flex-col items-center">
                    <Image src="/bot.png" alt="robot" width={420} height={420} />

                    <button
                      onClick={onClose}
                      className="mt-8 px-8 py-5 rounded-2xl bg-[#8F5BFF] text-white font-semibold flex items-center gap-3"
                    >
                      Выбрать тариф
                      <ArrowRight size={18} />
                    </button>
                  </div>

                </div>
              </section>

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
