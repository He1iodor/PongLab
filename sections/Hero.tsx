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

  const [, forceRender] = useState(0);

  useEffect(() => {
    let raf: number;

    const update = () => {
      const b = ball.current;
      const m = mouse.current;

      // 🔥 smooth follow (critically damped feel)
      const dx = m.x - b.x;
      const dy = m.y - b.y;

      b.x += dx * 0.16;
      b.y += dy * 0.16;

      b.vx = dx;
      b.vy = dy;

      b.speed = Math.min(Math.hypot(dx, dy), 40);

      // trail (no React state!)
      const t = trail.current;
      t.push({ x: b.x, y: b.y, vx: dx, vy: dy });

      if (t.length > 40) t.shift();

      raf = requestAnimationFrame(update);
    };

    raf = requestAnimationFrame(update);

    return () => cancelAnimationFrame(raf);
  }, []);

  // optional: slow UI refresh (NOT motion)
  useEffect(() => {
    const id = setInterval(() => forceRender((p) => p + 1), 1000 / 30);
    return () => clearInterval(id);
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
      <div className="absolute inset-0" />

      {/* CURSOR GLOW (PURE REF BASED — NO REACT LAG) */}
      <div
        className="absolute w-[140px] h-[140px] rounded-full bg-[#8F5BFF] opacity-40 blur-[50px] pointer-events-none"
        style={{
          transform: `translate3d(${ball.current.x - 70}px, ${ball.current.y - 70}px, 0)`,
        }}
      />

      {/* TRAIL (also ref-based) */}
      {trail.current.map((p, i) => {
        const t = i / trail.current.length;
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
                rgba(143,91,255,0) 100%)`,
              filter: "blur(6px)",
            }}
          />
        );
      })}

      {/* BALL (ULTRA SMOOTH DOM MOTION) */}
      <div
        className="absolute pointer-events-none z-30"
        style={{
          transform: `translate3d(${ball.current.x}px, ${ball.current.y}px, 0)`,
        }}
      >
        {/* aura */}
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

        {/* core */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 18,
            height: 18,
            background:
              "radial-gradient(circle at 35% 35%, #fff 0%, #ddd 100%)",
            boxShadow:
              "0 0 12px rgba(255,255,255,0.9), 0 0 20px rgba(143,91,255,0.4)",
          }}
        />
      </div>

      {/* PARTICLES (unchanged ok) */}
      <div className="absolute inset-0 pointer-events-none">
        <FloatingParticles />
      </div>

      {/* CONTENT (static, no rerenders tied to motion) */}
      <div className="relative z-10 mx-auto max-w-[1400px] px-6">
        <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 items-center gap-12">
          <div>
            <h1 className="text-6xl md:text-8xl font-black leading-[0.95]">
              Тренируйся <br />
              умнее. <br />
              <span className="text-[#8F5BFF]">Играй сильнее.</span>
            </h1>
          </div>

          <div className="hidden lg:block">
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
