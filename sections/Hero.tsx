"use client";

import Image from "next/image";
import Counter from "@/components/Counter";
import { useState } from "react";
import { motion } from "framer-motion";

export default function Hero() {
  const [mousePosition, setMousePosition] = useState({
  x: 0,
  y: 0,
});

const handleMouseMove = (
  e: React.MouseEvent<HTMLElement>
) => {
  setMousePosition({
    x: e.clientX,
    y: e.clientY,
  });
};
  return (
   <section
  className="relative min-h-screen overflow-hidden"
  onMouseMove={handleMouseMove}
>

      {/* Фоновое изображение */}

      <div className="absolute inset-0">

        <Image
          src="/hero-bg.png"
          alt="PongLab"
          fill
          priority
          className="
            object-cover
            object-center
            scale-105
          "
        />

      </div>

      {/* Затемнение */}

      <div
        className="
        absolute
        inset-0
        bg-[linear-gradient(90deg,#090B18_0%,rgba(9,11,24,.95)_30%,rgba(9,11,24,.65)_55%,rgba(9,11,24,.8)_100%)]
        "
      />

      {/* Свет */}

      <div
        className="
        absolute
        left-[-250px]
        top-[100px]
        h-[700px]
        w-[700px]
        rounded-full
        bg-[#6B30CE]
        opacity-20
        blur-[180px]
        "
      />

      <div
        className="
        absolute
        right-[-200px]
        bottom-[-100px]
        h-[500px]
        w-[500px]
        rounded-full
        bg-[#8F5BFF]
        opacity-20
        blur-[150px]
        "
      />
<motion.div
  animate={{
    x: mousePosition.x - 250,
    y: mousePosition.y - 250,
  }}
  transition={{
    type: "spring",
    stiffness: 40,
    damping: 20,
  }}
  className="
  absolute
  h-[500px]
  w-[500px]
  rounded-full
  bg-[#6B30CE]
  opacity-[0.12]
  blur-[150px]
  pointer-events-none
  "
/>
      <div className="relative z-10">

        <div className="mx-auto max-w-[1400px] px-6">

          <div className="flex min-h-screen items-center">

            <div className="max-w-[700px]">

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="
                inline-flex
                rounded-full
                border
                border-white/10
                bg-white/5
                px-5
                py-2
                text-xs
                tracking-[2px]
                text-[#B088FF]
                backdrop-blur-xl
                "
              >
                УМНЫЕ ТРЕНИРОВКИ НОВОГО ПОКОЛЕНИЯ
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: .8 }}
                className="
                mt-8
                text-6xl
                font-black
                leading-[0.95]
                md:text-8xl
                "
              >
                Тренируйся
                <br />
                умнее.
                <br />
                <span className="text-[#8F5BFF]">
                  Играй сильнее.
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: .3 }}
                className="
                mt-8
                max-w-[620px]
                text-lg
                leading-8
                text-white/75
                "
              >
                Персональные тренировки с роботизированной
                подачей, аналитикой и тысячами качественных
                повторений для быстрого прогресса.
              </motion.p>

              <div className="mt-10 flex flex-wrap gap-4">

                <button
                  className="
                  rounded-2xl
                  px-8
                  py-4
                  font-semibold
                  bg-[#6B30CE]
                  transition-all
                  duration-300
                  hover:scale-105
                  hover:shadow-[0_0_40px_rgba(107,48,206,.7)]
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
                  px-8
                  py-4
                  backdrop-blur-xl
                  "
                >
                  Смотреть видео
                </button>

              </div>

             <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-4">

                <div>
                  <div className="text-4xl font-black">
  <Counter end={10000} />+
</div>
                  <div className="mt-2 text-white/60">
                    тренировок
                  </div>
                </div>

                <div>
                 <div className="text-4xl font-black">
  <Counter end={3500} />+
</div>
                  <div className="mt-2 text-white/60">
                    ударов
                  </div>
                </div>

                <div>
                  <div className="text-4xl font-black">
                    24/7
                  </div>
                  <div className="mt-2 text-white/60">
                    доступ
                  </div>
                </div>

              </div>

            </div>

          </div>

        </div>

      </div>

    </section>
  );
}
