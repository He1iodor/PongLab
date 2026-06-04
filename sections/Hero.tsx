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
    px: 300,
    py: 300,
  });

  const [renderBall, setRenderBall] = useState({
    x: 300,
    y: 300,
    speed: 0,
  });

  const trail = useRef<{ x: number; y: number; vx: number; vy: number }[]>([]);

  useEffect(() => {
    let raf: number;

    const loop = () => {
      const b = ball.current;

      // 🧲 Verlet + attraction to mouse
      const ax = (mouse.current.x - b.x) * 0.18;
      const ay = (mouse.current.y - b.y) * 0.18;

      const vx = b.x - b.px;
      const vy = b.y - b.py;

      b.px = b.x;
      b.py = b.y;

      b.x += vx + ax;
      b.y += vy + ay;

      const speed = Math.min(Math.hypot(vx, vy), 50);

      // ✨ trail (lightweight)
      trail.current.push({ x: b.x, y: b.y, vx, vy });
      if (trail.current.length > 28) trail.current.shift();

      setRenderBall({
        x: b.x,
        y: b.y,
        speed,
      });

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
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
      {/* ================= BACKGROUND ================= */}
      <div className="absolute inset-0" />

      <div className="absolute left-[-200px] top-[120px] w-[600px] h-[600px] bg-purple-600/30 blur-[140px]" />
      <div className="absolute right-[-200px] bottom-[-120px] w-[500px] h-[500px] bg-[#8F5BFF]/20 blur-[140px]" />

      {/* ================= PARTICLES ================= */}
      <FloatingParticles />

      {/* ================= TRAIL ================= */}
      {trail.current.map((p, i) => {
        const t = i / trail.current.length;
        const size = 2 + Math.hypot(p.vx, p.vy) * 0.3;

        return (
          <div
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: size,
              height: size,
              transform: `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`,
              background: `radial-gradient(circle,
                rgba(255,255,255,${t}) 0%,
                rgba(143,91,255,${t * 0.7}) 40%,
                transparent 100%)`,
              filter: "blur(6px)",
            }}
          />
        );
      })}

      {/* ================= BALL ================= */}
      <div
        className="absolute pointer-events-none z-30"
        style={{
          transform: `translate3d(${renderBall.x}px, ${renderBall.y}px, 0)`,
        }}
      >
        {/* aura */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 22 + renderBall.speed * 0.4,
            height: 22 + renderBall.speed * 0.4,
            background:
              "radial-gradient(circle, rgba(143,91,255,0.35), transparent 70%)",
            filter: "blur(8px)",
          }}
        />

        {/* core */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 18,
            height: 18,
            background:
              "radial-gradient(circle at 30% 30%, #fff, #dcdcdc)",
            boxShadow:
              "0 0 15px rgba(255,255,255,0.9), 0 0 25px rgba(143,91,255,0.4)",
          }}
        />

        {/* energy */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8F5BFF]"
          style={{
            width: 8,
            height: 8,
            opacity: Math.min(renderBall.speed * 0.03, 0.3),
            filter: "blur(4px)",
          }}
        />
      </div>

      {/* ================= CONTENT (unchanged) ================= */}
      <div className="relative z-10 mx-auto max-w-[1400px] px-6">
        <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 items-center gap-12">

          <div className="max-w-[700px]">
            <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs text-[#B088FF]">
              УМНЫЕ ТРЕНИРОВКИ
            </div>

            <h1 className="mt-8 text-6xl md:text-8xl font-black leading-[0.95]">
              Тренируйся
              <br />
              умнее.
              <br />
              <span className="text-[#8F5BFF]">Играй сильнее.</span>
            </h1>

            <button className="mt-10 px-8 py-4 rounded-2xl bg-[#6B30CE]">
              Попробовать
            </button>

            <div className="mt-14 grid grid-cols-3 gap-4">
              <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
                <Counter end={1000} />+
              </div>
              <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
                <Counter end={1500} />+
              </div>
              <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
                24/7
              </div>
            </div>
          </div>

          <div className="hidden lg:flex justify-center">
            <Image
              src="/logo.png"
              alt="robot"
              width={650}
              height={650}
            />
          </div>

        </div>
      </div>
    </section>
  );
}
