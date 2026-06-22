"use client";

import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function WhyEffectiveModal({
  open,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="
        fixed
        inset-0
        z-[9999]
        bg-black/80
        backdrop-blur-xl
        flex
        items-center
        justify-center
        p-4
      "
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="
          relative
          w-[96%]
          max-w-[1700px]
          h-[92vh]
          overflow-y-auto
          rounded-[32px]
          bg-[#0B0D18]
          border
          border-white/10
          text-white
        "
      >
        <button
          onClick={onClose}
          className="
            absolute
            top-6
            right-6
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

        <div className="p-12">
          TEST
        </div>
      </div>
    </div>
  );
}
