"use client";

import Image from "next/image";
import Counter from "@/components/Counter";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export default function Hero() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // 🟣 BALL PHYSICS
  const [ball, setBall] = useState({
    x: 300,
    y: 300,
    vx: 3,
    vy: 2,
  });

  const rafRef = useRef<number | null>(null);

  // 🧠 PHYSICS LOOP
  useEffect(() => {
    const update = () => {
      setBall((prev) => {
        let x = prev.x + prev.vx;
        let y = prev.y + prev.vy;
        let vx = prev.vx;
        let vy = prev.vy;

        const width = window.innerWidth;
        const height = window.innerHeight;

        // 🧲 mouse attraction (core upgrade)
        const dx = mousePosition.x - x;
        const dy = mousePosition.y - y;

        vx += dx * 0.00003;
        vy += dy * 0.00003;

        // 🧊 damping (smooth AI feel)
        vx *= 0.985;
        vy *= 0.985;

        // 🧱 bounce boundaries
        if (x < 40 || x > width - 40) vx *= -1;
        if (y < 40 || y > height - 40) vy *= -1;

        return {
          x,
          y,
          vx,
          vy,
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
      {/* 🧠 DEPTH BACKGROUND LAYER */}
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

      {/* 🟣 DEPTH GLOWS (parallax) */}
      <motion.div
        animate={{
          x: mousePosition.x * 0.03,
          y: mousePosition.y * 0.03,
        }}
        className="absolute left-[-250px] top-[100px] w-[700px] h-[700px] rounded-full bg-[#6B30CE] opacity-25 blur-[180px]"
      />

      <motion.div
        animate={{
          x: mousePosition.x * -0.02,
          y: mousePosition.y * -0.02,
        }}
        className="absolute right-[-200px] bottom-[-100px] w-[500px] h-[500px] rounded-full bg-[#8F5BFF] opacity-25 blur-[150px]"
      />

      {/* 🟣 MOUSE GLOW */}
      <motion.div
        animate={{
          x: mousePosition.x - 250,
          y: mousePosition.y - 250,
        }}
        transition={{ type: "spring", stiffness: 40, damping: 25 }}
        className="absolute w-[500px] h-[500px] rounded-full bg-[#6B30CE] opacity-[0.12] blur-[140px] pointer-events-none"
      />

      {/* 🟣 BALL (REAL PHYSICS) */}
      <motion.div
        className="absolute w-3 h-3 rounded-full bg-white shadow-[0_0_40px_white] z-30 pointer-events-none"
        animate={{
          x: ball.x,
          y: ball.y,
        }}
        transition={{
          type: "spring",
          stiffness: 140,
          damping: 18,
        }}
      />

      {/* 🔥 STRONG VISIBLE TRAIL (FIXED) */}
      <motion.div
        className="absolute w-28 h-28 rounded-full bg-[#8F5BFF] blur-[70px] opacity-30 z-10 pointer-events-none"
        animate={{
          x: ball.x - 50,
          y: ball.y - 50,
        }}
        transition={{
          type: "spring",
          stiffness: 60,
          damping: 20,
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

          {/* RIGHT */}
          <div className="hidden lg:flex justify-center items-center relative">
            <div className="relative w-full max-w-[650px]">
              <Image
                src="/logo.png"
                alt="PongLab Robot"
                width={650}
                height={650}
                className="w-full h-auto drop-shadow-[0_0_90px_rgba(107,48,206,.7)]"
              />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
