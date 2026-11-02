
"use client";

import { useEffect } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import TariffsContent from "./TariffsContent";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function TariffsModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="tariffs-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.65, ease: "easeInOut" }}
          onClick={onClose}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-2 backdrop-blur-xl sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Тарифы PongLab"
        >
          <motion.div
            initial={{ opacity: 0, y: 25, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.985 }}
            transition={{
              duration: 0.65,
              ease: [0.22, 1, 0.36, 1],
            }}
            onClick={(event) => event.stopPropagation()}
            className="
              tariffs-scrollbar
              relative h-[96dvh] max-h-[1100px] w-full max-w-[1720px]
              overflow-y-auto overscroll-contain
              rounded-[24px] border border-white/10
              bg-[#090B18] text-white
              shadow-[0_30px_120px_rgba(0,0,0,.65)]
              sm:h-[94vh] sm:rounded-[32px]
            "
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
              <div className="absolute -left-40 top-20 h-[440px] w-[440px] rounded-full bg-[#6B30CE]/15 blur-[130px]" />
              <div className="absolute -right-40 top-[38%] h-[520px] w-[520px] rounded-full bg-[#386BFF]/10 blur-[150px]" />
            </div>

            {/* Настоящий логотип вместо фиолетовой заглушки */}
            <div className="
              absolute left-5 top-5 z-30
              flex h-12 w-12 items-center justify-center
              overflow-hidden rounded-full
              border border-white/15
              bg-transparent
              shadow-[0_0_28px_rgba(143,91,255,.2)]
              sm:left-7 sm:top-7 sm:h-14 sm:w-14
            ">
              <Image
                src="/logo2.png"
                alt="PongLab"
                width={112}
                height={112}
                priority
                sizes="56px"
                className="h-full w-full object-contain"
              />
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть тарифы"
              className="
                absolute right-4 top-4 z-30
                flex h-11 w-11 items-center justify-center
                rounded-xl border border-white/10
                bg-[#111427]/90 text-white/75 backdrop-blur
                transition-all duration-700 ease-in-out
                hover:rotate-90 hover:border-[#8F5BFF]/50
                hover:bg-white/10 hover:text-white
                sm:right-7 sm:top-7
              "
            >
              <X size={20} />
            </button>

            <div className="relative z-10 px-4 pb-8 pt-20 sm:px-7 sm:pb-12 sm:pt-24 lg:px-12 lg:pb-14">
              <TariffsContent />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
