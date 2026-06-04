"use client";

import Image from "next/image";
import Counter from "@/components/Counter";
import FloatingParticles from "@/components/FloatingParticles";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export default function Hero() {
  const mouseRef = useRef({ x: 0, y: 0 });

  const ballRef = useRef({
    x: 300,
    y: 300,
    vx: 0,
    vy: 0,
    speed: 0,
  });

  const [ball, setBall] = useState(ballRef.current);
  const [trail, setTrail] = useState<{ x: number; y: number; vx: number; vy: number }[]>([]);

  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      const ball = ballRef.current;

      // 🧲 smooth follow (NO React state here)
      ball.x += (mouseRef.current.x - ball.x) * 0.18;
      ball.y += (mouseRef.current.y - ball.y) * 0.18;

      ball.vx = ball.x - (ballRef.current.vxTarget ?? ball.x);
      ball.vy = ball.y - (ballRef.current.vyTarget ?? ball.y);

      ballRef.current.vxTarget = ball.x;
      ballRef.current.vyTarget = ball.y;

      const speed = Math.min(Math.hypot(ball.vx, ball.vy), 40);
      ball.speed = speed;

      // 🎯 update UI state (throttled via rAF naturally)
      setBall({ ...ball });

      // ✨ trail (still OK, but lightweight)
      setTrail((t) => {
        const next = [...t, { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy }];
        if (next.length > 35) next.shift();
        return next;
      });

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <section
      onMouseMove={(e) => {
        mouseRef.current.x = e.clientX;
        mouseRef.current.y = e.clientY;
      }}
      className="relative min-h-screen overflow-hidden bg-[#090B18] text-white"
    >
      {/* BACKGROUND */}
      <div className="absolute inset-0" />

      {/* OVERLAY */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#090B18_0%,rgba(9,11,24,.95)_40%,rgba(9,11,24,.7)_70%,rgba(9,11,24,.95)_100%)]" />

      {/* GLOWS */}
      <motion.div
        animate={{
          x: mouseRef.current.x * 0.03,
          y: mouseRef.current.y * 0.03,
        }}
        className="absolute left-[-250px] top-[100px] w-[650px] h-[650px] rounded-full bg-[#6B30CE] opacity-30 blur-[160px]"
      />

      <motion.div
        animate={{
          x: mouseRef.current.x * -0.02,
          y: mouseRef.current.y * -0.02,
        }}
        className="absolute right-[-200px] bottom-[-100px] w-[450px] h-[450px] rounded-full bg-[#8F5BFF] opacity-25 blur-[140px]"
      />

      {/* CURSOR GLOW (smooth spring OK) */}
      <motion.div
        animate={{
          x: mouseRef.current.x - 70,
          y: mouseRef.current.y - 70,
        }}
        transition={{ type: "spring", stiffness: 80, damping: 18 }}
        className="absolute w-[140px] h-[140px] rounded-full bg-[#8F5BFF] opacity-40 blur-[50px] pointer-events-none"
      />

      {/* PARTICLES */}
      <div className="absolute inset-0 pointer-events-none">
        <FloatingParticles />
      </div>

      {/* TRAIL */}
      {trail.map((p, i) => {
        const t = i / trail.length;
        const speed = Math.min(Math.hypot(p.vx, p.vy), 30);
        const size = 2 + speed * 0.4;

        return (
          <div
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
          />
        );
      })}

      {/* BALL (NO SPRING = NO JITTER) */}
      <motion.div
        className="absolute z-30 pointer-events-none"
        animate={{
          x: ball.x,
          y: ball.y,
        }}
        transition={{
          type: "tween",
          duration: 0,
        }}
      >
        {/* AURA */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 20 + ball.speed * 0.4,
            height: 20 + ball.speed * 0.4,
            background:
              "radial-gradient(circle, rgba(143,91,255,0.35) 0%, rgba(143,91,255,0) 70%)",
            filter: "blur(8px)",
            opacity: 0.7,
          }}
        />

        {/* CORE */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 18,
            height: 18,
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
            width: 9,
            height: 9,
            opacity: Math.min(ball.speed * 0.03, 0.3),
            filter: "blur(4px)",
          }}
        />
      </motion.div>

      {/* CONTENT (unchanged) */}
      <div className="relative z-10 mx-auto max-w-[1400px] px-6">
        <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 items-center gap-12">

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

            <p className="mt-8 max-w-[620px] text-white/75">
              Персональные тренировки с роботизированной подачей.
            </p>

            <div className="mt-10 flex gap-4">
              <button className="rounded-2xl px-8 py-4 bg-[#6B30CE]">
                Попробовать
              </button>
            </div>

            <div className="mt-14 grid grid-cols-3 gap-4">
              <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
                <Counter end={1000} />+
              </div>
              <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
                <Counter end={1500} />+
              </div>
              <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
                24/7
              </div>
            </div>
          </div>

          <div className="hidden lg:flex justify-center">
            <Image
              src="/logo.png"
              alt="Robot"
              width={650}
              height={650}
              className="drop-shadow-[0_0_100px_rgba(107,48,206,.7)]"
            />
          </div>

        </div>
      </div>
    </section>
  );
}
