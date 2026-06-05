"use client";

import Image from "next/image";
import Counter from "@/components/Counter";
import FloatingParticles from "@/components/FloatingParticles";
import { useEffect, useRef } from "react";

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
          `translate3d(${x - 150}px, ${y - 150}px, 0)`;
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
      className="relative min-h-[100svh] pt-24 pb-16 overflow-hidden bg-[#090B18] text-white"
    >
      {/* PARTICLES */}
      <div className="absolute inset-0 pointer-events-none z-10">
        <FloatingParticles />
      </div>

      {/* MOUSE GLOW */}
      <div
        ref={glowRef}
        className="absolute z-20 w-[320px] h-[320px] rounded-full bg-[#8F5BFF] opacity-25 blur-[120px] pointer-events-none"
      />

      {/* CONTENT */}
      <div className="relative z-30 mx-auto max-w-[1400px] px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 items-start lg:items-center gap-12">

          {/* LEFT */}
          <div className="max-w-[700px]">

            <h1 className="mt-6 text-5xl md:text-8xl font-black leading-[0.95]">
              Тренируйся
              <br />
              умнее.
              <br />
              <span className="text-[#8F5BFF]">Играй сильнее.</span>
            </h1>

            <p className="mt-6 max-w-[620px] text-base md:text-lg text-white/70">
              Персональные тренировки с роботизированной подачей,
              аналитикой и тысячами качественных повторений.
            </p>

            <div className="mt-8 flex gap-4">
              <button className="px-8 py-4 rounded-2xl bg-[#6B30CE] hover:scale-105 transition">
                Попробовать
              </button>
            </div>

            {/* STATS */}
            <div className="mt-6 grid grid-cols-3 gap-6">

              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center">
                <div className="text-2xl font-black"><Counter end={1000} />+</div>
                <div className="text-white/60 text-sm">тренировок</div>
              </div>

              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center">
                <div className="text-2xl font-black"><Counter end={1500} />+</div>
                <div className="text-white/60 text-sm">ударов</div>
              </div>

              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center">
                <div className="text-2xl font-black">24/7</div>
                <div className="text-white/60 text-sm">доступ</div>
              </div>

            </div>
          </div>

          {/* RIGHT */}
          <div className="hidden lg:flex justify-end items-center">
            <div className="relative w-full max-w-[650px] lg:ml-28 lg:mt-6 flex items-center justify-center">

              {/* MAIN ROTATING RING */}
              <div className="absolute w-[560px] h-[560px] orbit-spin">
                <div className="absolute inset-0 rounded-full orbit-core" />
              </div>

              {/* TRAIL GLOW (SMOOTH BREATHING) */}
              <div className="absolute w-[560px] h-[560px] orbit-spin">
                <div className="absolute inset-0 rounded-full orbit-trail" />
              </div>

              {/* PARTICLES */}
              <div className="absolute w-[560px] h-[560px]">
                <span className="orbit-particle" />
                <span className="orbit-particle slow" />
                <span className="orbit-particle fast" />
                <span className="orbit-particle slow" />
                <span className="orbit-particle fast" />
              </div>

              {/* INNER GLOW */}
              <div className="absolute w-[500px] h-[500px] rounded-full orbit-inner-glow bg-[radial-gradient(circle,rgba(143,91,255,0.15),transparent_65%)] blur-2xl" />

              {/* ROBOT */}
              <Image
                src="/bot.png"
                alt="Robot Training"
                width={520}
                height={520}
                className="relative drop-shadow-[0_0_120px_rgba(107,48,206,.6)]"
              />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
