"use client";

import Image from "next/image";
import Counter from "@/components/Counter";
import { motion } from "framer-motion";
import { useState } from "react";

export default function Hero() {
  const [mousePosition, setMousePosition] = useState({
    x: 0,
    y: 0,
  });

  const ballPathX = [200, 400, 700, 1000, 700, 400, 200];
  const ballPathY = [300, 200, 250, 150, 200, 280, 300];

  return (
    <section
      onMouseMove={(e) =>
        setMousePosition({
          x: e.clientX,
          y: e.clientY,
        })
      }
      className="relative min-h-screen overflow-hidden bg-[#090B18] text-white"
    >
      {/* BACKGROUND */}
      <div className="absolute inset-0">
        <motion.div
          animate={{
            x: mousePosition.x * 0.015,
            y: mousePosition.y * 0.015,
          }}
          transition={{ type: "spring", stiffness: 20, damping: 30 }}
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

      {/* OVERLAY */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#090B18_0%,rgba(9,11,24,.96)_30%,rgba(9,11,24,.7)_60%,rgba(9,11,24,.9)_100%)]" />

      {/* GLOWS */}
      <div className="absolute left-[-250px] top-[100px] w-[700px] h-[700px] rounded-full bg-[#6B30CE] opacity-20 blur-[180px]" />
      <div className="absolute right-[-200px] bottom-[-100px] w-[500px] h-[500px] rounded-full bg-[#8F5BFF] opacity-20 blur-[150px]" />

      {/* MOUSE GLOW */}
      <motion.div
        animate={{
          x: mousePosition.x - 250,
          y: mousePosition.y - 250,
        }}
        transition={{ type: "spring", stiffness: 40, damping: 20 }}
        className="absolute w-[500px] h-[500px] rounded-full bg-[#6B30CE] opacity-[0.12] blur-[150px] pointer-events-none"
      />

      {/* LEVEL 2 — FLOATING BALL */}
      <motion.div
        className="absolute w-3 h-3 rounded-full bg-white shadow-[0_0_30px_white] z-20 pointer-events-none"
        animate={{
          x: ballPathX,
          y: ballPathY,
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* LEVEL 3 — LIGHT TRAIL */}
      <motion.div
        className="absolute w-28 h-28 rounded-full bg-[#8F5BFF] blur-[60px] opacity-20 z-10 pointer-events-none"
        animate={{
          x: ballPathX,
          y: ballPathY,
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* FLOATING PARTICLES */}
      <motion.div
        animate={{ y: [0, -30, 0] }}
        transition={{ duration: 6, repeat: Infinity }}
        className="absolute top-[25%] left-[70%] w-5 h-5 rounded-full bg-white/80 shadow-[0_0_25px_white]"
      />

      <motion.div
        animate={{ y: [0, 40, 0] }}
        transition={{ duration: 8, repeat: Infinity }}
        className="absolute top-[40%] left-[80%] w-3 h-3 rounded-full bg-[#8F5BFF] shadow-[0_0_20px_#8F5BFF]"
      />

      {/* MAIN GRID */}
      <div className="relative z-10 mx-auto max-w-[1400px] px-6">
        <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 items-center gap-12">

          {/* LEFT */}
          <motion.div
            animate={{
              x: mousePosition.x * 0.003,
              y: mousePosition.y * 0.003,
            }}
            transition={{ type: "spring", stiffness: 30, damping: 20 }}
            className="max-w-[700px]"
          >
            <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs tracking-[2px] text-[#B088FF] backdrop-blur-xl">
              УМНЫЕ ТРЕНИРОВКИ НОВОГО ПОКОЛЕНИЯ
            </div>

            <h1 className="mt-8 text-5xl md:text-8xl font-black leading-[0.95]">
              Тренируйся
              <br />
              умнее.
              <br />
              <span className="text-[#8F5BFF]">Играй сильнее.</span>
            </h1>

            <p className="mt-8 max-w-[620px] text-base md:text-lg leading-7 md:leading-8 text-white/75">
              Персональные тренировки с роботизированной подачей,
              аналитикой и тысячами качественных повторений.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <button className="rounded-2xl px-8 py-4 font-semibold bg-[#6B30CE] hover:scale-105 transition">
                Попробовать
              </button>

              <button className="rounded-2xl border border-white/10 bg-white/5 px-8 py-4 backdrop-blur-xl">
                Смотреть видео
              </button>
            </div>

            <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
                <div className="text-3xl md:text-4xl font-black">
                  <Counter end={1000} />+
                </div>
                <div className="text-white/60 mt-2">тренировок</div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
                <div className="text-3xl md:text-4xl font-black">
                  <Counter end={1500} />+
                </div>
                <div className="text-white/60 mt-2">ударов</div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
                <div className="text-3xl md:text-4xl font-black">24/7</div>
                <div className="text-white/60 mt-2">доступ</div>
              </div>
            </div>
          </motion.div>

          {/* RIGHT — ROBOT + UI */}
          <div className="hidden lg:flex relative justify-center items-center">

            {/* GLASS PANEL (LEVEL 4) */}
            <div className="absolute top-10 right-10 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl px-5 py-4 z-20">
              <div className="text-[#B088FF] text-sm font-semibold">
                AI Tracking
              </div>
              <div className="text-white/70 text-xs mt-1">
                98% Accuracy
              </div>
            </div>

            <motion.div
              animate={{ y: [0, -15, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
              className="relative w-full max-w-[650px]"
            >
              <Image
                src="/logo.png"
                alt="PongLab Robot"
                width={650}
                height={650}
                className="w-full h-auto drop-shadow-[0_0_80px_rgba(107,48,206,.6)]"
              />
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}
