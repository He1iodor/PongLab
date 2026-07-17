"use client";

import Image from "next/image";

export default function Hero() {
  return (
    <section className="relative overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.025]">

      {/* Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:88px_88px]" />

      {/* Purple glow */}
      <div className="absolute left-[-120px] top-[-160px] h-[520px] w-[520px] rounded-full bg-[#6B30CE]/20 blur-[180px]" />

      <div className="absolute right-[-150px] top-[80px] h-[620px] w-[620px] rounded-full bg-[#9C5CFF]/15 blur-[220px]" />

      <div className="absolute bottom-[-200px] left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#6B30CE]/10 blur-[220px]" />

      {/* Giant number */}
      <div
        className="
        pointer-events-none
        absolute
        left-16
        top-10
        text-[220px]
        font-black
        leading-none
        text-white/[0.035]
        select-none
      "
      >
        01
      </div>

      <div className="relative z-10 grid min-h-[760px] grid-cols-12">

        {/* LEFT */}

        <div className="col-span-7 flex flex-col justify-center px-20 py-24">

          <span
            className="
              mb-6
              inline-flex
              w-fit
              rounded-full
              border
              border-[#8F5BFF]/30
              bg-[#6B30CE]/10
              px-5
              py-2
              text-sm
              tracking-[0.25em]
              uppercase
              text-[#CDAEFF]
            "
          >
            Why PongLab
          </span>

          <h1
            className="
              max-w-[760px]
              text-[74px]
              font-black
              leading-[0.95]
              tracking-[-0.04em]
            "
          >
            Тренируйся
            <br />
            эффективнее
            <br />
            обычной
            <br />
            секции
          </h1>

          <p
            className="
              mt-10
              max-w-[610px]
              text-[19px]
              leading-9
              text-white/65
            "
          >
            Робот заменяет десятки однотипных упражнений,
            постоянно подает мячи с нужной скоростью,
            вращением и направлением, а ты концентрируешься
            исключительно на технике и прогрессе.
          </p>

          <div className="mt-14 flex items-center gap-5">

            <button
              className="
                rounded-2xl
                bg-[#6B30CE]
                px-9
                py-5
                text-lg
                font-semibold
                transition
                hover:bg-[#7A42DD]
              "
            >
              Попробовать
            </button>

            <button
              className="
                rounded-2xl
                border
                border-white/10
                bg-white/5
                px-9
                py-5
                text-lg
                text-white/80
                backdrop-blur-xl
                transition
                hover:bg-white/10
              "
            >
              Смотреть видео
            </button>

          </div>

        </div>

        {/* RIGHT */}

        <div className="relative col-span-5">

          <div
            className="
              absolute
              inset-0
              flex
              items-center
              justify-center
            "
          >

            <div
              className="
                absolute
                h-[640px]
                w-[640px]
                rounded-full
                border
                border-[#8F5BFF]/15
              "
            />

            <div
              className="
                absolute
                h-[520px]
                w-[520px]
                rounded-full
                border
                border-white/5
              "
            />

            <Image
              src="/robot.png"
              alt="Robot"
              width={620}
              height={760}
              priority
              className="
                relative
                z-20
                h-auto
                w-[560px]
                object-contain
                drop-shadow-[0_40px_120px_rgba(107,48,206,.45)]
              "
            />

          </div>

          {/* Floating Card 1 */}

          <div
            className="
              absolute
              right-6
              top-20
              w-[260px]
              rounded-[26px]
              border
              border-white/10
              bg-white/[0.05]
              p-6
              backdrop-blur-2xl
            "
          >

            <div className="text-[44px] font-black text-[#CDAEFF]">
              5–10x
            </div>

            <div className="mt-3 text-lg font-semibold">
              больше касаний мяча
            </div>

            <p className="mt-3 text-sm leading-7 text-white/60">
              За одну тренировку робот способен подать
              значительно больше мячей,
              чем обычный партнер.
            </p>

          </div>

          {/* Floating Card 2 */}

          <div
            className="
              absolute
              left-0
              bottom-24
              w-[250px]
              rounded-[26px]
              border
              border-white/10
              bg-white/[0.05]
              p-6
              backdrop-blur-2xl
            "
          >

            <div className="text-[42px] font-black text-[#CDAEFF]">
              100%
            </div>

            <div className="mt-3 text-lg font-semibold">
              стабильная подача
            </div>

            <p
              className="
                mt-3
                text-sm
                leading-7
                text-white/60
              "
            >
              Без усталости,
              случайностей
              и человеческого фактора.
            </p>

          </div>
          {/* Floating Card 3 */}

          <div
            className="
              absolute
              left-10
              top-24
              w-[220px]
              rounded-[26px]
              border
              border-white/10
              bg-white/[0.05]
              p-5
              backdrop-blur-2xl
            "
          >
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-[#8F5BFF]" />
              <span className="text-sm uppercase tracking-[0.25em] text-white/60">
                Analytics
              </span>
            </div>

            <div className="mt-5 text-[36px] font-black">
              98%
            </div>

            <p className="mt-3 text-sm leading-7 text-white/60">
              Точность подачи сохраняется на протяжении всей тренировки,
              независимо от скорости и вращения.
            </p>
          </div>

          {/* Floating Card 4 */}

          <div
            className="
              absolute
              right-10
              bottom-12
              w-[280px]
              rounded-[28px]
              border
              border-white/10
              bg-white/[0.05]
              p-7
              backdrop-blur-2xl
            "
          >
            <div className="text-sm uppercase tracking-[0.25em] text-white/55">
              Smart Training
            </div>

            <div className="mt-5 space-y-4">

              <div className="flex items-center justify-between">
                <span className="text-white/60">Скорость</span>

                <span className="font-semibold">
                  20–120 км/ч
                </span>
              </div>

              <div className="h-px bg-white/10" />

              <div className="flex items-center justify-between">
                <span className="text-white/60">
                  Вращение
                </span>

                <span className="font-semibold">
                  Любое
                </span>
              </div>

              <div className="h-px bg-white/10" />

              <div className="flex items-center justify-between">
                <span className="text-white/60">
                  Частота
                </span>

                <span className="font-semibold">
                  до 120/мин
                </span>
              </div>

            </div>
          </div>

          {/* Decorative dots */}

          <div className="absolute left-16 top-[360px] flex gap-3">
            <div className="h-2 w-2 rounded-full bg-[#8F5BFF]" />
            <div className="h-2 w-2 rounded-full bg-white/20" />
            <div className="h-2 w-2 rounded-full bg-white/20" />
          </div>

          <div className="absolute right-[90px] top-[330px] h-[120px] w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />

          <div className="absolute left-[120px] bottom-[170px] h-px w-[150px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        </div>
      </div>

      {/* Bottom info strip */}

      <div
        className="
          relative
          z-20
          border-t
          border-white/10
          bg-black/10
          backdrop-blur-xl
        "
      >
        <div className="grid grid-cols-4">

          <div className="border-r border-white/10 p-10">
            <div className="text-[42px] font-black text-[#CDAEFF]">
              5–10x
            </div>

            <div className="mt-3 text-white/70">
              больше касаний за тренировку
            </div>
          </div>

          <div className="border-r border-white/10 p-10">
            <div className="text-[42px] font-black text-[#CDAEFF]">
              100%
            </div>

            <div className="mt-3 text-white/70">
              одинаковая подача
            </div>
          </div>

          <div className="border-r border-white/10 p-10">
            <div className="text-[42px] font-black text-[#CDAEFF]">
              AI
            </div>

            <div className="mt-3 text-white/70">
              анализ прогресса
            </div>
          </div>

          <div className="p-10">
            <div className="text-[42px] font-black text-[#CDAEFF]">
              ∞
            </div>

            <div className="mt-3 text-white/70">
              сценариев тренировок
            </div>
          </div>

        </div>
      </div>

    </section>
  );
}