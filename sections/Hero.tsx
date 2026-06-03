"use client";

import Image from "next/image";
import Counter from "@/components/Counter";
import FloatingParticles from "@/components/FloatingParticles";
import { motion } from "framer-motion";
import { useState } from "react";

export default function Hero() {
  const [mousePosition, setMousePosition] = useState({
    x: 0,
    y: 0,
  });

  return (
    <section
      onMouseMove={(e) =>
        setMousePosition({
          x: e.clientX,
          y: e.clientY,
        })
      }
      className="
      relative
      min-h-screen
      overflow-hidden
      bg-[#090B18]
      text-white
      "
    >
      {/* Background */}

      <div className="absolute inset-0">
        <motion.div
          animate={{
            x: mousePosition.x * 0.015,
            y: mousePosition.y * 0.015,
          }}
          transition={{
            type: "spring",
            stiffness: 20,
            damping: 30,
          }}
          className="absolute inset-0"
        >
          <Image
            src="/hero-bg.png"
            alt="PongLab"
            fill
            priority
            className="object-cover scale-110"
          />
        </motion.div>
      </div>

      {/* Overlay */}

      <div
        className="
        absolute
        inset-0
        bg-[linear-gradient(90deg,#090B18_0%,rgba(9,11,24,.96)_30%,rgba(9,11,24,.7)_60%,rgba(9,11,24,.9)_100%)]
        "
      />

      {/* Glow */}

      <div
        className="
        absolute
        left-[-250px]
        top-[100px]
        w-[700px]
        h-[700px]
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
        w-[500px]
        h-[500px]
        rounded-full
        bg-[#8F5BFF]
        opacity-20
        blur-[150px]
        "
      />

      {/* Mouse Glow */}

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
        w-[500px]
        h-[500px]
        rounded-full
        bg-[#6B30CE]
        opacity-[0.12]
        blur-[150px]
        pointer-events-none
        "
      />

      {/* Floating Particles */}

      <motion.div
        animate={{
          y: [0, -30, 0],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
        }}
        className="
        absolute
        top-[25%]
        left-[70%]
        w-5
        h-5
        rounded-full
        bg-white/80
        shadow-[0_0_25px_white]
        "
      />

      <motion.div
        animate={{
          y: [0, 40, 0],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
        }}
        className="
        absolute
        top-[40%]
        left-[80%]
        w-3
        h-3
        rounded-full
        bg-[#8F5BFF]
        shadow-[0_0_20px_#8F5BFF]
        "
      />
<FloatingParticles />
      {/* Content */}

      <div className="relative z-10 mx-auto max-w-[1400px] px-6">
        <div className="flex min-h-screen items-center">

          <motion.div
            animate={{
              x: mousePosition.x * 0.003,
              y: mousePosition.y * 0.003,
            }}
            transition={{
              type: "spring",
              stiffness: 30,
              damping: 20,
            }}
            className="max-w-[700px]"
          >
            <div
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
            </div>

            <h1
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
            </h1>

            <p
              className="
              mt-8
              max-w-[620px]
              text-lg
              leading-8
              text-white/75
              "
            >
              Персональные тренировки с роботизированной подачей,
              аналитикой и тысячами качественных повторений для
              быстрого прогресса.
            </p>

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

              <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
                <div className="text-4xl font-black">
                  <Counter end={1000} />+
                </div>
                <div className="mt-2 text-white/60">
                  тренировок
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
                <div className="text-4xl font-black">
                  <Counter end={1500} />+
                </div>
                <div className="mt-2 text-white/60">
                  ударов за сессию
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
                <div className="text-4xl font-black">
                  24/7
                </div>
                <div className="mt-2 text-white/60">
                  доступность
                </div>
              </div>

            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
