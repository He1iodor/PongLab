"use client";

import Image from "next/image";
import Counter from "@/components/Counter";
import FloatingParticles from "@/components/FloatingParticles";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export default function Hero() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // 🟣 BALL STATE
  const [ball, setBall] = useState({
    x: 300,
    y: 300,
    vx: 0,
    vy: 0,
  });

  const rafRef = useRef<number | null>(null);

  // 🧠 PHYSICS (faster follow + tighter control)
  useEffect(() => {
    const update = () => {
      setBall((prev) => {
        let x = prev.x + (mousePosition.x - prev.x) * 0.18;
        let y = prev.y + (mousePosition.y - prev.y) * 0.18;

        return {
          x,
          y,
          vx: 0,
          vy: 0,
        };
      });

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mousePosition]);

  return (
    <section
      onMouseMove={(e) =>
        setMousePosition({ x: e.clientX, y: e.clientY })
      }
      className="relative min-h-screen overflow-hidden bg-[#090B18] text-white"
    >
      {/* BACKGROUND */}
      <motion.div
        animate={{
          x: mousePosition.x * 0.02,
          y: mousePosition.y * 0.02,
        }}
        className="absolute inset-0"
      >
        <Image
          src="/hero-bg.png"
          alt="PongLab"
          fill
          priority
          className="object-cover scale-110 opacity-80"
        />
      </motion.div>

      {/* OVERLAY */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#090B18_0%,rgba(9,11,24,.95)_40%,rgba(9,11,24,.7)_70%,rgba(9,11,24,.95)_100%)]" />

      {/* GLOWS */}
      <motion.div
        animate={{
          x: mousePosition.x * 0.03,
          y: mousePosition.y * 0.03,
        }}
        className="absolute left-[-250px] top-[100px] w-[650px] h-[650px] rounded-full bg-[#6B30CE] opacity-30 blur-[160px]"
      />

      <motion.div
        animate={{
          x: mousePosition.x * -0.02,
          y: mousePosition.y * -0.02,
        }}
        className="absolute right-[-200px] bottom-[-100px] w-[450px] h-[450px] rounded-full bg-[#8F5BFF] opacity-25 blur-[140px]"
      />

      {/* 🟣 CURSOR GLOW (SMALLER + STRONGER) */}
      <motion.div
        animate={{
          x: mousePosition.x - 140,
          y: mousePosition.y - 140,
        }}
        transition={{ type: "spring", stiffness: 80, damping: 18 }}
        className="absolute w-[280px] h-[280px] rounded-full bg-[#8F5BFF] opacity-30 blur-[90px] pointer-events-none"
      />

      {/* 🟣 BALL */}
      <motion.div
        className="absolute w-3 h-3 rounded-full bg-white shadow-[0_0_40px_white] z-30 pointer-events-none"
        animate={{
          x: ball.x,
          y: ball.y,
        }}
        transition={{ type: "spring", stiffness: 160, damping: 18 }}
      />

      {/* 🟣 COMET TRAIL (CHAIN EFFECT) */}
      <motion.div
        className="absolute w-6 h-6 rounded-full bg-[#8F5BFF] blur-[30px] opacity-40 z-20 pointer-events-none"
        animate={{
          x: ball.x - 10,
          y: ball.y - 10,
        }}
        transition={{ type: "spring", stiffness: 120, damping: 25 }}
      />

      <motion.div
        className="absolute w-10 h-10 rounded-full bg-[#8F5BFF] blur-[50px] opacity-20 z-10 pointer-events-none"
        animate={{
          x: ball.x - 20,
          y: ball.y - 20,
        }}
        transition={{ type: "spring", stiffness: 90, damping: 30 }}
      />

      {/* PARTICLES (YOUR COMPONENT) */}
      <div className="absolute inset-0 pointer-events-none">
        <FloatingParticles mousePosition={mousePosition} />
      </div>

      {/* MAIN CONTENT */}
      <div className="relative z-10 mx-auto max-w-[1400px] px-6">
        <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 items-center gap-12">

          {/* LEFT */}
          <div className="max-w-[700px]">
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
          </div>

          {/* RIGHT */}
          <div className="hidden lg:flex justify-center items-center">
            <div className="relative w-full max-w-[650px]">
              <Image
                src="/logo.png"
                alt="PongLab Robot"
                width={650}
                height={650}
                className="w-full h-auto drop-shadow-[0_0_100px_rgba(107,48,206,.7)]"
              />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
