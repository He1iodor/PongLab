"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { X, ArrowRight, Zap } from "lucide-react";
import { useEffect, useCallback, useRef } from "react";

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

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
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
          transition={{ duration: 0.35 }}
          className="
            fixed
            inset-0
            z-[9999]
            bg-black/80
            backdrop-blur-xl
            flex
            items-center
            justify-center
            p-2
            md:p-4
          "
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 20 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="
              relative
              w-[96vw]
              h-[95vh]
              overflow-hidden
              rounded-[38px]
              border
              border-white/10
              bg-[#090B18]
              shadow-[0_50px_120px_rgba(0,0,0,.75)]
            "
          >
            {/* background glow */}
            <div className="absolute -top-[250px] -right-[250px] w-[700px] h-[700px] rounded-full bg-[#8F5BFF]/20 blur-[180px] pointer-events-none" />
            <div className="absolute -bottom-[300px] -left-[300px] w-[800px] h-[800px] rounded-full bg-[#6B30CE]/20 blur-[220px] pointer-events-none" />

            {/* close */}
            <button
              onClick={onClose}
              className="
                absolute
                top-6
                right-6
                z-50
                h-12
                w-12
                rounded-2xl
                border
                border-white/10
                bg-white/5
                backdrop-blur
                flex
                items-center
                justify-center
                hover:bg-white/10
                transition
              "
            >
              <X size={20} />
            </button>

            {/* scroll */}
            <div className="h-full overflow-y-auto no-scrollbar scroll-smooth snap-y snap-mandatory">
              {/* HERO */}
              <section className="relative min-h-[95vh] snap-start flex items-center px-8 md:px-20">
                <div className="grid lg:grid-cols-2 gap-10 items-center w-full">
                  <div>
                    <motion.div
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-[#8F5BFF]/30 bg-[#8F5BFF]/10 text-[#CDB8FF] mb-8"
                    >
                      <Zap size={16} />
                      Почему игроки выбирают PongLab
                    </motion.div>

                    <motion.h1
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 }}
                      className="text-6xl md:text-8xl font-black leading-[0.9] tracking-[-0.04em]"
                    >
                      Тренируйся
                      <br />
                      эффективнее.
                      <br />
                      <span className="text-[#8F5BFF]">Прогрессируй</span>
                      <br />
                      быстрее.
                    </motion.h1>

                    <motion.p
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.35 }}
                      className="mt-8 max-w-xl text-xl text-white/65 leading-relaxed"
                    >
                      До 10 раз больше игровых повторений за тренировку. Максимум практики. Максимум контроля. Максимум прогресса.
                    </motion.p>

                    <motion.div
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.45 }}
                      className="mt-10 flex items-center gap-4"
                    >
                      <button className="px-8 py-5 rounded-2xl bg-gradient-to-r from-[#6B30CE] to-[#8F5BFF] font-semibold hover:scale-105 transition-all">
                        Узнать больше
                      </button>
                    </motion.div>
                  </div>

                  <div className="relative flex justify-center items-center">
                    <div className="absolute w-[600px] h-[600px] rounded-full bg-[#8F5BFF]/20 blur-[160px]" />
                    <Image
                      src="/bot.png"
                      alt="PongLab Robot"
                      width={820}
                      height={820}
                      className="relative z-10 object-contain drop-shadow-[0_0_120px_rgba(143,91,255,.35)]"
                    />
                  </div>
                </div>
              </section>

              {/* SECTION 2 */}
              <section className="snap-start text-center py-20">
                <div className="text-[140px] md:text-[320px] font-black leading-none tracking-[-0.08em] text-[#8F5BFF]">
                  10x
                </div>

                <h2 className="text-4xl md:text-7xl font-black leading-[0.95] mt-2">
                  Больше игровых
                  <br />
                  повторений
                </h2>

                <p className="mt-10 text-xl text-white/65 max-w-3xl mx-auto">
                  Пока обычная тренировка тратит время на ожидание и паузы, PongLab позволяет концентрироваться исключительно на практике.
                </p>
              </section>

              {/* SECTION 3 */}
              <section className="snap-start grid lg:grid-cols-2 gap-12 px-10 py-20">
                <div className="relative">
                  <div className="absolute inset-0 rounded-[40px] bg-[#8F5BFF]/10 blur-[100px]" />
                  <div className="relative rounded-[40px] border border-white/10 bg-white/[0.04] overflow-hidden p-10">
                    <Image src="/bot.png" alt="PongLab" width={700} height={700} className="mx-auto object-contain" />
                  </div>
                </div>

                <div>
                  <div className="text-[#8F5BFF] uppercase tracking-[0.25em] text-sm mb-6">
                    Точность
                  </div>

                  <h2 className="text-5xl md:text-7xl font-black leading-[0.95]">
                    Отрабатывайте
                    <br />
                    именно то,
                    <br />
                    что хотите
                    <br />
                    улучшить
                  </h2>

                  <p className="mt-10 text-xl text-white/65 max-w-xl leading-relaxed">
                    Робот способен повторять один и тот же сценарий сотни раз подряд с одинаковой точностью.
                  </p>
                </div>
              </section>

              {/* SECTION 4 */}
              <section className="snap-start text-center py-20">
                <div className="text-[120px] md:text-[260px] font-black leading-none tracking-[-0.08em] text-white">
                  1000+
                </div>
                <h2 className="text-4xl md:text-7xl font-black mt-4">
                  ударов
                  <br />
                  за тренировку
                </h2>
              </section>

              {/* SECTION 5 */}
              <section className="snap-start px-10 py-20">
                <div className="text-center mb-20">
                  <h2 className="text-5xl md:text-7xl font-black leading-[0.95]">
                    Почему игроки прогрессируют быстрее
                  </h2>
                </div>
              </section>

              {/* SECTION 6 */}
              <section className="snap-start grid lg:grid-cols-2 gap-12 px-10 py-20">
                <div>
                  <h2 className="text-5xl md:text-7xl font-black leading-[0.95]">
                    Каждая тренировка оставляет данные
                  </h2>
                </div>
              </section>

              {/* SECTION 7 */}
              <section className="snap-start text-center py-20">
                <Image src="/logo.png" alt="PongLab" width={140} height={140} className="mx-auto mb-10" />
                <h2 className="text-5xl md:text-8xl font-black leading-[0.9]">
                  Каждая тренировка приближает вас к новому уровню
                </h2>
              </section>

              {/* SECTION 8 */}
              <section className="snap-start grid lg:grid-cols-2 gap-12 px-10 py-20">
                <div>
                  <h2 className="text-5xl md:text-7xl font-black leading-[0.95]">
                    Готовы начать?
                  </h2>

                  <button
                    onClick={onClose}
                    className="mt-10 inline-flex items-center gap-3 px-8 py-5 rounded-2xl bg-gradient-to-r from-[#6B30CE] to-[#8F5BFF] font-semibold hover:scale-105 transition-all"
                  >
                    Выбрать тариф
                    <ArrowRight size={18} />
                  </button>
                </div>
              </section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
  );
}
