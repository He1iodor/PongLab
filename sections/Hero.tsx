"use client";

import Image from "next/image";
import Counter from "@/components/Counter";
import FloatingParticles from "@/components/FloatingParticles";
import { useEffect, useRef, useState } from "react";

export default function Hero() {
  const mouse = useRef({ x: 0, y: 0 });

  const ball = useRef({
    x: 300,
    y: 300,
    vx: 0,
    vy: 0,
    speed: 0,
  });

  const trail = useRef<{ x: number; y: number; vx: number; vy: number }[]>([]);

  const [, setTick] = useState(0);

  // 🧠 LIVE COUNTERS TICK (1 FPS)
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(id);
  }, []);

  // 🧠 PHYSICS LOOP (SMOOTH + INERTIA)
  useEffect(() => {
    let raf: number;

    const update = () => {
      const b = ball.current;
      const m = mouse.current;

      const dx = m.x - b.x;
      const dy = m.y - b.y;

      // ✨ spring physics (Apple-style feel)
      b.vx += dx * 0.12;
      b.vy += dy * 0.12;

      b.vx *= 0.72;
      b.vy *= 0.72;

      b.x += b.vx;
      b.y += b.vy;

      b.speed = Math.min(Math.hypot(b.vx, b.vy), 60);

      const t = trail.current;
      t.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy });

      if (t.length > 45) t.shift();

      raf = requestAnimationFrame(update);
    };

    raf = requestAnimationFrame(update);

    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section
      onMouseMove={(e) => {
        mouse.current.x = e.clientX;
        mouse.current.y = e.clientY;
      }}
      className="relative min-h-screen overflow-hidden bg-[#090B18] text-white"
    >
      {/* BACKGROUND */}
      <div className="absolute inset-0 bg-[#090B18]" />

      {/* CURSOR GLOW */}
      <div
        className="absolute w-[140px] h-[140px] rounded-full bg-[#8F5BFF] opacity-40 blur-[50px] pointer-events-none"
        style={{
          transform: `translate3d(${ball.current.x - 70}px, ${
            ball.current.y - 70
          }px, 0)`,
        }}
      />

      {/* TRAIL */}
      {trail.current.map((p, i) => {
        const t = i / trail.current.length;
        const speed = Math.min(Math.hypot(p.vx, p.vy), 30);
        const size = 2 + speed * 0.35;

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
                rgba(143,91,255,0) 100%)`,
              filter: "blur(6px)",
            }}
          />
        );
      })}

      {/* BALL */}
      <div
        className="absolute z-30 pointer-events-none"
        style={{
          transform: `translate3d(${ball.current.x}px, ${ball.current.y}px, 0)`,
        }}
      >
        {/* AURA */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 20 + ball.current.speed * 0.4,
            height: 20 + ball.current.speed * 0.4,
            background:
              "radial-gradient(circle, rgba(143,91,255,0.35) 0%, rgba(143,91,255,0) 70%)",
            filter: "blur(8px)",
          }}
        />

        {/* CORE */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 18,
            height: 18,
            background:
              "radial-gradient(circle at 35% 35%, #ffffff 0%, #eaeaea 100%)",
            boxShadow:
              "0 0 12px rgba(255,255,255,0.9), 0 0 20px rgba(143,91,255,0.4)",
          }}
        />
      </div>

      {/* PARTICLES */}
      <div className="absolute inset-0 pointer-events-none">
        <FloatingParticles />
      </div>

      {/* CONTENT */}
      <div className="relative z-10 mx-auto max-w-[1400px] px-6">
        <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 items-center gap-12">
          {/* LEFT */}
          <div className="max-w-[700px]">
            <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs tracking-[2px] text-[#B088FF] backdrop-blur-xl">
              УМНЫЕ ТРЕНИРОВКИ НОВОГО ПОКОЛЕНИЯ
            </div>

            <h1 className="mt-8 text-5xl md:text-8xl font-black leading-[0.95]">
              Тренируйся <br />
              умнее. <br />
              <span className="text-[#8F5BFF]">Играй сильнее.</span>
            </h1>

            <p className="mt-8 max-w-[620px] text-base md:text-lg text-white/75">
              Персональные тренировки с роботизированной подачей и аналитикой.
            </p>

            <div className="mt-10 flex gap-4">
              <button className="rounded-2xl px-8 py-4 font-semibold bg-[#6B30CE] hover:scale-105 transition">
                Попробовать
              </button>

              <button className="rounded-2xl border border-white/10 bg-white/5 px-8 py-4">
                Смотреть видео
              </button>
            </div>

            {/* COUNTERS (LIVE BUT LIGHT) */}
            <div className="mt-14 grid grid-cols-3 gap-4">
              <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
                <div className="text-3xl font-black">
                  <Counter end={1000} />+
                </div>
                <div className="text-white/60 mt-2">тренировок</div>
              </div>

              <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
                <div className="text-3xl font-black">
                  <Counter end={1500} />+
                </div>
                <div className="text-white/60 mt-2">ударов</div>
              </div>

              <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
                <div className="text-3xl font-black">24/7</div>
                <div className="text-white/60 mt-2">доступ</div>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="hidden lg:flex justify-center items-center">
            <Image
              src="/logo.png"
              alt="robot"
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
