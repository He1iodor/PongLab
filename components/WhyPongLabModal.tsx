"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import HeroSection from "./why-ponglab/HeroSection";

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
        fixed inset-0
        z-[9999]
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
          max-w-[1800px]
          h-[92vh]
          overflow-y-auto

          rounded-[32px]

          bg-[#090B18]
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
        {/* Purple Glow */}
        <div
          className="
            absolute
            top-[10%]
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

        {/* Blue Glow */}
        <div
          className="
            absolute
            bottom-0
            right-[-150px]

            w-[600px]
            h-[600px]

            rounded-full
            bg-[#4A7DFF]/10

            blur-[150px]

            pointer-events-none
          "
        />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="
            absolute
            top-6
            right-6
            z-50

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

        {/* Content */}
        <div className="relative z-10">
          <HeroSection />
        </div>
      </div>
    </div>
  );
}
