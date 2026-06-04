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
  });

  const [trail, setTrail] = useState<
    { x: number; y: number; vx: number; vy: number }[]
  >([]);

  const rafRef = useRef<number | null>(null);

  // 🧠 mouse tracking (NO rerenders)
  useEffect(() => {
    const move = (e: MouseEvent) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    };

    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  // 🧠 physics loop
  useEffect(() => {
    const update = () => {
      const b = ball.current;

      const dx = mouse.current.x - b.x;
      const dy = mouse.current.y - b.y;

      // smooth spring
      b.vx += dx * 0.18;
      b.vy += dy * 0.18;

      // damping (critical for smoothness)
      b.vx *= 0.72;
      b.vy *= 0.72;

      b.x += b.vx;
      b.y += b.vy;

      const speed = Math.min(
        Math.sqrt(b.vx * b.vx + b.vy * b.vy),
        40
      );

      // trail batching (not every frame render-heavy)
      setTrail((t) => {
        const next = [...t, { x: b.x, y: b.y, vx: b.vx, vy: b.vy }];
        if (next.length > 30) next.shift();
        return next;
      });

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const ballPos = ball.current;

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#090B18] text-white">
      
      {/* BACKGROUND */}
      <div className="absolute inset-0">
        <FloatingParticles />
      </div>

      {/* CURSOR GLOW */}
      <div
        className="absolute w-[120px] h-[120px] rounded-full bg-[#8F5BFF] opacity-40 blur-[50px] pointer-events-none"
        style={{
          transform: `translate(${mouse.current.x - 60}px, ${mouse.current.y - 60}px)`,
        }}
      />

      {/* TRAIL */}
      {trail.map((p, i) => {
        const t = i / trail.length;
        const speed = Math.min(
          Math.sqrt(p.vx * p.vx + p.vy * p.vy),
          30
        );

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
                rgba(143,91,255,0) 100%
              )`,
              filter: "blur(6px)",
            }}
          />
        );
      })}

      {/* BALL */}
      <div
        className="absolute z-30 pointer-events-none"
        style={{
          transform: `translate(${ballPos.x}px, ${ballPos.y}px)`,
        }}
      >
        <div
          className="w-5 h-5 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 35% 35%, #fff 0%, #ddd 60%, #aaa 100%)",
            boxShadow:
              "0 0 12px rgba(255,255,255,0.9), 0 0 25px rgba(143,91,255,0.4)",
          }}
        />
      </div>

      {/* CONTENT */}
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
              Персональные тренировки с роботизированной подачей,
              аналитикой и тысячами качественных повторений.
            </p>

            <div className="mt-10 flex gap-4">
              <button className="rounded-2xl px-8 py-4 bg-[#6B30CE]">
                Попробовать
              </button>

              <button className="rounded-2xl border border-white/10 bg-white/5 px-8 py-4">
                Смотреть видео
              </button>
            </div>

            <div className="mt-14 grid grid-cols-3 gap-4">
              <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
                <Counter end={1000} />+
                <div className="text-white/60">тренировок</div>
              </div>

              <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
                <Counter end={1500} />+
                <div className="text-white/60">ударов</div>
              </div>

              <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
                24/7
                <div className="text-white/60">доступ</div>
              </div>
            </div>
          </div>

          <div className="hidden lg:flex justify-center items-center">
            <Image
              src="/logo.png"
              alt="PongLab"
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
