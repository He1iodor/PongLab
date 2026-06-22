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

        <div className="p-0">

  {/* HERO */}

  <section className="relative overflow-hidden border-b border-white/10">

    <div
      className="
        absolute
        inset-0
        bg-gradient-to-r
        from-black/80
        via-black/40
        to-black/70
        z-10
      "
    />

    <div
      className="
        absolute
        inset-0
        bg-[radial-gradient(circle_at_center,rgba(140,255,0,0.08),transparent_60%)]
        z-10
      "
    />

    <img
      src="/efficiency-hero.jpg"
      alt=""
      className="
        absolute
        inset-0
        w-full
        h-full
        object-cover
      "
    />

    <div
      className="
        relative
        z-20
        px-16
        py-20
      "
    >

      <div className="max-w-[900px]">

        <div
          className="
            text-[#B9FF45]
            font-black
            text-6xl
            leading-none
          "
        >
          ДО 10 РАЗ БОЛЬШЕ
        </div>

        <div
          className="
            mt-2
            text-white
            font-black
            text-6xl
            leading-tight
          "
        >
          ИГРОВЫХ ПОВТОРЕНИЙ
          <br />
          ЗА ТРЕНИРОВКУ
        </div>

        <p
          className="
            mt-8
            max-w-[700px]
            text-xl
            text-white/80
            leading-9
          "
        >
          Каждая подача превращается в возможность
          отработать технику, скорость реакции
          и стабильность без пауз и ожидания.
        </p>

      </div>

    </div>

  </section>

  {/* SECTION 1 */}

  <section className="min-h-[500px]">
  </section>

  {/* SECTION 2 */}

  <section className="min-h-[500px]">
  </section>

  {/* SECTION 3 */}

  <section className="min-h-[500px]">
  </section>

  {/* SECTION 4 */}

  <section className="min-h-[500px]">
  </section>

  {/* SECTION 5 */}

  <section className="min-h-[500px]">
  </section>

  {/* SECTION 6 */}

  <section className="min-h-[500px]">
  </section>

</div>
      </div>
    </div>
  );
}
