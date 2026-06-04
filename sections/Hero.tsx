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

  const [renderBall, setRenderBall] = useState(ball.current);
  const [trail, setTrail] = useState<{ x: number; y: number; vx: number; vy: number }[]>([]);

  const raf = useRef<number | null>(null);

  useEffect(() => {
    const loop = () => {
      const b = ball.current;

      // 🧲 smooth follow (no spring, no framer)
      b.x += (mouse.current.x - b.x) * 0.16;
      b.y += (mouse.current.y - b.y) * 0.16;

      b.vx = b.x - (b.prevX ?? b.x);
      b.vy = b.y - (b.prevY ?? b.y);

      b.prevX = b.x;
      b.prevY = b.y;

      b.speed = Math.min(Math.hypot(b.vx, b.vy), 40);

      // 🎯 render update (throttled naturally by RAF)
      setRenderBall({ ...b });

      // ✨ trail (lightweight)
      setTrail((t) => {
        const next = [...t, { x: b.x, y: b.y, vx: b.vx, vy: b.vy }];
        if (next.length > 28) next.shift();
        return next;
      });

      raf.current = requestAnimationFrame(loop);
    };

    raf.current = requestAnimationFrame(loop);
    return () => raf.current && cancelAnimationFrame(raf.current);
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

      {/* glow layers */}
      <div className="absolute left-[-200px] top-[120px] w-[600px] h-[600px] bg-purple-600/30 blur-[140px]" />
      <div className="absolute right-[-200px] bottom-[-120px] w-[500px] h-[500px] bg-[#8F5BFF]/20 blur-[140px]" />

      {/* cursor glow (still framer OK) */}
      <div
        className="absolute w-[140px] h-[140px] rounded-full bg-[#8F5BFF]/30 blur-[60px] pointer-events-none"
        style={{
          transform: `translate3d(${mouse.current.x - 70}px, ${mouse.current.y - 70}px, 0)`,
        }}
      />

      {/* ================= PARTICLES ================= */}
      <FloatingParticles />

      {/* ================= TRAIL ================= */}
      {trail.map((p, i) => {
        const t = i / trail.length;
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

            <p className="mt-8 text-white/70">
              Персональные тренировки с AI-аналитикой.
            </p>

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
