"use client";

import Counter from "@/components/Counter";
import FloatingParticles from "@/components/FloatingParticles";
import { useEffect, useRef } from "react";
import Image from "next/image";

export default function Hero() {
  const mouse = useRef({ x: 0, y: 0 });
  const glowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let x = 0;
    let y = 0;

    const animate = () => {
      x += (mouse.current.x - x) * 0.12;
      y += (mouse.current.y - y) * 0.12;

      if (glowRef.current) {
        glowRef.current.style.transform =
          `translate3d(${x - 160}px, ${y - 160}px, 0)`;
      }

      requestAnimationFrame(animate);
    };

    animate();
  }, []);

  return (
    <section
      onMouseMove={(e) => {
        mouse.current.x = e.clientX;
        mouse.current.y = e.clientY;
      }}
      className="relative min-h-screen overflow-hidden text-white"
    >

      {/* 🖼 BACKGROUND IMAGE (NO DARKENING) */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/hero-bg.jpg"
          alt="Background"
          fill
          priority
          className="object-cover scale-105"
        />
      </div>

      {/* ✨ PARTICLES */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <FloatingParticles />
      </div>

      {/* 🔮 CURSOR GLOW */}
      <div
        ref={glowRef}
        className="absolute z-20 w-[320px] h-[320px] rounded-full bg-[#8F5BFF] opacity-25 blur-[120px] pointer-events-none"
      />

      {/* CONTENT */}
      <div className="relative z-30 mx-auto max-w-[1400px] px-6">
        <div className="min-h-screen flex items-center">

          {/* LEFT ONLY (no right column) */}
          <div className="max-w-[750px]">

            <div className="inline-flex rounded-full border border-white/10 bg-white/10 px-5 py-2 text-xs tracking-[2px] text-white backdrop-blur-xl">
              УМНЫЕ ТРЕНИРОВКИ НОВОГО ПОКОЛЕНИЯ
            </div>

            <h1 className="mt-8 text-5xl md:text-8xl font-black leading-[0.95]">
              <br />
              Тренируйся
              <br />
              умнее.
              <br />
              <span className="text-[#8F5BFF]">Играй сильнее.</span>
            </h1>

            <p className="mt-8 max-w-[620px] text-base md:text-lg leading-7 md:leading-8 text-white/80">
              Персональные тренировки с роботизированной подачей,
              аналитикой и тысячами качественных повторений
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <button className="rounded-2xl px-8 py-4 font-semibold bg-[#6B30CE] hover:scale-105 transition">
                Попробовать
              </button>

              <button className="rounded-2xl border border-white/20 bg-white/10 px-8 py-4 backdrop-blur-xl">
                Смотреть видео
              </button>
            </div>

            <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-3xl border border-white/10 bg-white/10 backdrop-blur-xl p-6">
                <div className="text-3xl md:text-4xl font-black">
                  <Counter end={1000} />+
                </div>
                <div className="text-white/70 mt-2">тренировок</div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/10 backdrop-blur-xl p-6">
                <div className="text-3xl md:text-4xl font-black">
                  <Counter end={1500} />+
                </div>
                <div className="text-white/70 mt-2">ударов</div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/10 backdrop-blur-xl p-6">
                <div className="text-3xl md:text-4xl font-black">24/7</div>
                <div className="text-white/70 mt-2">доступ</div>
              </div>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
