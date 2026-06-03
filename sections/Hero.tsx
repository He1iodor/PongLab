"use client";

import Image from "next/image";
import Counter from "@/components/Counter";
import FloatingParticles from "@/components/FloatingParticles";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export default function Hero() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const [ball, setBall] = useState({
    x: 300,
    y: 300,
    vx: 0,
    vy: 0,
    speed: 0,
  });

  const [trail, setTrail] = useState<
    { x: number; y: number; vx: number; vy: number }[]
  >([]);

  const rafRef = useRef<number | null>(null);

  // 🧠 physics loop
  useEffect(() => {
    const update = () => {
      setBall((prev) => {
        const x = prev.x + (mousePosition.x - prev.x) * 0.22;
        const y = prev.y + (mousePosition.y - prev.y) * 0.22;

        const vx = x - prev.x;
        const vy = y - prev.y;

        const speed = Math.min(Math.sqrt(vx * vx + vy * vy), 40);

        setTrail((t) => {
          const next = [...t, { x, y, vx, vy }];
          if (next.length > 35) next.shift();
          return next;
        });

        return { x, y, vx, vy, speed };
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

      {/* CURSOR GLOW (SMALLER) */}
      <motion.div
        animate={{
          x: mousePosition.x - 70,
          y: mousePosition.y - 70,
        }}
        transition={{ type: "spring", stiffness: 80, damping: 18 }}
        className="absolute w-[120px] h-[120px] rounded-full bg-[#8F5BFF] opacity-40 blur-[50px] pointer-events-none"
      />

      {/* PARTICLES */}
      <div className="absolute inset-0 pointer-events-none">
        <FloatingParticles />
      </div>

      {/* TRAIL */}
      {trail.map((p, i) => {
        const t = i / trail.length;
        const speed = Math.min(Math.sqrt(p.vx * p.vx + p.vy * p.vy), 30);
        const size = 2 + speed * 0.4;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: p.x,
              top: p.y,
              width: size,
              height: size,
              transform: "translate(-50%, -50%)",
              background: `radial-gradient(circle,
                rgba(255,255,255,${t}) 0%,
                rgba(143,91,255,${t * 0.7}) 40%,
                rgba(143,91,255,0) 100%
              )`,
              filter: "blur(6px)",
            }}
            animate={{
              opacity: t,
              scale: 1 + speed * 0.02,
            }}
            transition={{ duration: 0.05 }}
          />
        );
      })}

      {/* 🟣 BALL (SMALLER VERSION) */}
      <motion.div
        className="absolute z-30 pointer-events-none"
        animate={{
          x: ball.x,
          y: ball.y,
        }}
        transition={{
          x: { type: "spring", stiffness: 180, damping: 20 },
          y: { type: "spring", stiffness: 180, damping: 20 },
        }}
      >
        {/* AURA */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 22 + ball.speed * 0.4,
            height: 22 + ball.speed * 0.4,
            background:
              "radial-gradient(circle, rgba(143,91,255,0.35) 0%, rgba(143,91,255,0) 70%)",
            filter: "blur(8px)",
            opacity: 0.7,
          }}
        />

        {/* CORE (SMALLER BALL) */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 20,
            height: 20,
            background:
              "radial-gradient(circle at 35% 35%, #ffffff 0%, #f3f3f3 45%, #dcdcdc 100%)",
            boxShadow:
              "0 0 12px rgba(255,255,255,0.9), 0 0 20px rgba(143,91,255,0.4)",
          }}
        />

        {/* MICRO ENERGY */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8F5BFF]"
          style={{
            width: 10,
            height: 10,
            opacity: Math.min(ball.speed * 0.03, 0.3),
            filter: "blur(4px)",
            transform: "translate(-5px, -5px)",
          }}
        />

        {/* IMPACT */}
        {ball.speed > 18 && (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#8F5BFF]"
            style={{
              width: 30,
              height: 30,
              opacity: 0.25,
              animation: "ping 0.6s cubic-bezier(0, 0, 0.2, 1)",
            }}
          />
        )}
      </motion.div>

      {/* CONTENT */}
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
