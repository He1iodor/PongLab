"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function EffectivenessModal({
  open,
  onClose,
}: Props) {
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

  return (
    <div
      onClick={onClose}
      className="
        fixed inset-0 z-[9999]
        bg-black/80
        backdrop-blur-xl
        flex items-center justify-center
        p-4
      "
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="
          relative
          w-[98%]
          max-w-[1700px]
          h-[92vh]
          overflow-y-auto
          rounded-[32px]
          border border-white/10
          bg-[#090B18]
          text-white
        "
      >
        {/* Фиолетовое свечение как в Hero */}
        <div
          className="
            absolute
            top-[15%]
            left-[50%]
            -translate-x-1/2
            w-[900px]
            h-[900px]
            rounded-full
            bg-[#8F5BFF]
            opacity-10
            blur-[220px]
            pointer-events-none
          "
        />

        {/* Кнопка закрытия */}
        <button
          onClick={onClose}
          className="
            absolute
            top-6
            right-6
            z-20
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

        {/* Контент будем добавлять позже */}
        <div className="relative z-10 p-8 lg:p-14">

          <div
            className="
              rounded-[24px]
              border border-white/10
              bg-white/[0.03]
              h-[600px]
            "
          />

        </div>
      </div>
    </div>
  );
}
