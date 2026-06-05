"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function HowItWorksModal({ open, onClose }: Props) {
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* BACKDROP */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-2xl"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* MODAL */}
          <motion.div
            className="
              relative
              w-[92%] max-w-6xl
              max-h-[90vh]
              overflow-y-auto
              rounded-[28px]
              bg-[#0B0D18]
              border border-white/10
              shadow-[0_0_120px_rgba(107,48,206,.25)]
              p-10
            "
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.92, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 40 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {/* CLOSE */}
            <button
              onClick={onClose}
              className="
                absolute top-5 right-5
                h-11 w-11
                rounded-xl
                bg-white/5
                hover:bg-white/10
                transition
                flex items-center justify-center
              "
            >
              <X size={20} />
            </button>

            {/* HEADER */}
            <motion.h2
              className="text-4xl md:text-6xl font-black"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              Как работает PongLab
            </motion.h2>

            <motion.p
              className="mt-4 text-white/60 max-w-2xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              Роботизированная система тренировок, аналитики и развития игровых навыков.
            </motion.p>

            {/* VIDEO */}
            <motion.div
              className="
                mt-10
                aspect-video
                rounded-3xl
                border border-white/10
                bg-black
                overflow-hidden
              "
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <iframe
                className="w-full h-full"
                src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                title="How it works"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </motion.div>

            {/* STEPS */}
            <div className="mt-12 grid md:grid-cols-3 gap-6">
              {[
                {
                  title: "Анализ уровня",
                  text: "Система определяет текущий уровень игрока.",
                },
                {
                  title: "Персональная программа",
                  text: "Формируется индивидуальная тренировка.",
                },
                {
                  title: "Аналитика",
                  text: "Сохраняются данные и отслеживается прогресс.",
                },
              ].map((step, i) => (
                <motion.div
                  key={step.title}
                  className="
                    rounded-3xl
                    bg-white/5
                    border border-white/10
                    p-6
                    hover:bg-white/10
                    transition
                  "
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.1 }}
                  whileHover={{ scale: 1.03 }}
                >
                  <div className="text-[#8F5BFF] font-bold">
                    ШАГ {i + 1}
                  </div>

                  <h3 className="mt-3 text-xl font-bold">
                    {step.title}
                  </h3>

                  <p className="mt-2 text-white/60">
                    {step.text}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* GLOW ACCENT */}
            <div className="absolute -top-40 -right-40 w-[300px] h-[300px] bg-[#8F5BFF]/20 blur-[120px]" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
