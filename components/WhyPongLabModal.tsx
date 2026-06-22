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
  className="
    relative
        {/* PURPLE GLOW */}
<div
  className="
    absolute
    top-0
    left-1/2
    -translate-x-1/2

    w-[900px]
    h-[900px]

    rounded-full
    bg-[#8F5BFF]/15
    blur-[180px]

    pointer-events-none
  "
/>

{/* BLUE GLOW */}
<div
  className="
    absolute
    bottom-0
    right-0

    w-[600px]
    h-[600px]

    rounded-full
    bg-[#4A7DFF]/10
    blur-[150px]

    pointer-events-none
  "
/>
    w-[96%]
    max-w-[1800px]
    max-h-[92vh]
    overflow-y-auto
    rounded-[32px]
    bg-[#0B0D18]
    border border-white/10
    text-white

    pt-20
    px-8
    pb-10

    lg:pt-24
    lg:px-14
    lg:pb-14
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
        <div className="relative z-10 grid lg:grid-cols-2 gap-16 items-start">

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
