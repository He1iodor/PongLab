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

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
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
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xl flex items-center justify-center p-2 md:p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 20 }}
            className="relative w-[96vw] h-[95vh] overflow-hidden rounded-[38px] border border-white/10 bg-[#090B18]"
          >
            {/* CLOSE */}
            <button
              onClick={onClose}
              className="absolute top-6 right-6 z-50 h-12 w-12 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center"
            >
              <X size={20} />
            </button>

            <div className="h-full overflow-y-auto snap-y snap-mandatory">

              {/* SECTION 1 */}
              <section className="min-h-[95vh] snap-start flex items-center px-10">
                <div className="grid lg:grid-cols-2 gap-10 w-full">

                  <div>
                    <div className="flex items-center gap-2 mb-6 text-[#CDB8FF]">
                      <Zap size={16} />
                      Почему PongLab
                    </div>

                    <h1 className="text-6xl font-black">
                      Тренируйся
                      <br />
                      эффективнее
                      <br />
                      быстрее
                    </h1>

                    <p className="mt-6 text-white/60">
                      До 10x больше повторений за тренировку
                    </p>

                    <button className="mt-10 px-8 py-4 rounded-xl bg-[#8F5BFF]">
                      Узнать больше
                    </button>
                  </div>

                  <div className="relative flex items-center justify-center">
                    <Image src="/bot.png" alt="" width={700} height={700} />
                  </div>

                </div>
              </section>

              {/* SECTION 2 */}
              <section className="snap-start text-center py-20">
                <div className="text-[200px] font-black text-[#8F5BFF]">10x</div>
                <div className="text-4xl font-bold">Больше повторений</div>
              </section>

              {/* SECTION 3 */}
              <section className="snap-start grid lg:grid-cols-2 gap-10 px-10 py-20">
                <div>
                  <Image src="/bot.png" alt="" width={600} height={600} />
                </div>
                <div>
                  <h2 className="text-5xl font-black">
                    Точная отработка
                  </h2>
                </div>
              </section>

              {/* SECTION 4 */}
              <section className="snap-start text-center py-20">
                <div className="text-[140px] font-black">1000+</div>
                <div className="text-3xl">ударов за тренировку</div>
              </section>

              {/* SECTION 5 */}
              <section className="snap-start px-10 py-20">
                <h2 className="text-5xl font-black text-center">
                  Почему быстрее прогресс
                </h2>
              </section>

              {/* SECTION 6 */}
              <section className="snap-start grid lg:grid-cols-2 gap-10 px-10 py-20">
                <div>
                  <h2 className="text-4xl font-black">
                    Аналитика тренировок
                  </h2>
                </div>

                <div className="p-10 border border-white/10 rounded-2xl">
                  <div className="text-5xl font-black">92%</div>
                </div>
              </section>

              {/* SECTION 7 */}
              <section className="snap-start text-center py-20">
                <Image src="/logo.png" alt="" width={120} height={120} />
                <h2 className="text-5xl font-black mt-10">
                  Каждый шаг ведёт вперёд
                </h2>
              </section>

              {/* SECTION 8 */}
              <section className="snap-start grid lg:grid-cols-2 gap-10 px-10 py-20">
                <div>
                  <h2 className="text-5xl font-black">
                    Готов начать?
                  </h2>

                  <button
                    onClick={onClose}
                    className="mt-10 px-8 py-4 bg-[#8F5BFF] rounded-xl flex items-center gap-2"
                  >
                    Выбрать тариф
                    <ArrowRight size={18} />
                  </button>
                </div>

                <div />
              </section>

            </div>
          </motion.div>
        )}
    </AnimatePresence>
  );
}
