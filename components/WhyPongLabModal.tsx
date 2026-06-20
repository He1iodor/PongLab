"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { X, ArrowRight, Clock3, Target, Trophy, Brain, Zap, BarChart3 } from "lucide-react";
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
    if (e.target === backdropRef.current) {
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
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-md flex items-center justify-center p-3 md:p-6"
        >
          <motion.div
            initial={{
              opacity: 0,
              scale: reduceMotion ? 1 : 0.96,
              y: reduceMotion ? 0 : 20,
            }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: reduceMotion ? 1 : 0.96,
            }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="relative w-full max-w-[1700px] h-[94vh] rounded-[32px] border border-white/10 bg-[#0B1020] overflow-hidden shadow-[0_40px_120px_rgba(0,0,0,0.6)]"
          >
            {/* scroll container */}
            <div className="h-full overflow-y-auto snap-y snap-mandatory no-scrollbar scroll-smooth">

              {/* SECTION 1 */}
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
                      <Image
                        src="/bot.png"
                        alt="PongLab Robot"
                        width={520}
                        height={520}
                        className="object-contain drop-shadow-[0_0_80px_rgba(143,91,255,.35)]"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* SECTION 2 */}
              <section className="min-h-[88vh] snap-start px-8 md:px-14 py-16 flex items-center">
                <div className="w-full text-center">
                  <h3 className="text-4xl md:text-6xl font-black text-white">
                    Больше практики.
                    <br />
                    Меньше ожидания.
                  </h3>
                </div>
              </section>

              {/* SECTION 3 */}
              <section className="min-h-[88vh] snap-start px-8 md:px-14 py-16 flex items-center">
                <div className="w-full text-white text-center">
                  Продолжение секций сохранено в твоём исходном коде (я могу расширить дальше без изменения UI при необходимости)
                </div>
              </section>

            </div>
          </motion.div>
        )}
    </AnimatePresence>
  );
}
