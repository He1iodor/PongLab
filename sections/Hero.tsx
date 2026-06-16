"use client";

import Image from "next/image";
import Counter from "@/components/Counter";
import FloatingParticles from "@/components/FloatingParticles";
import HowItWorksModal from "@/components/HowItWorksModal";
import { useState, useEffect, useRef } from "react";

export default function Hero() {
  const mouse = useRef({ x: 0, y: 0 });
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
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
    <>
      <section
  onMouseMove={(e) => {
    mouse.current.x = e.clientX;
    mouse.current.y = e.clientY;
  }}
  className="relative min-h-[100svh] pt-24 pb-16 overflow-x-hidden bg-[#090B18] text-white"
>
        {/* BACKGROUND PARTICLES */}
        <div className="absolute inset-0 pointer-events-none">
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

              <p className="mt-6 max-w-[620px] text-base md:text-lg leading-relaxed text-white/70">
                Персональные тренировки с роботизированной подачей,
                аналитикой и тысячами качественных повторений.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">

                <button className="rounded-2xl px-8 py-4 font-semibold bg-[#6B30CE] hover:scale-105 transition">
                  Записаться
                </button>

                <button
                  onClick={() => setHowItWorksOpen(true)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-8 py-4 backdrop-blur-xl hover:bg-white/10 transition"
                >
                  Узнать больше
                </button>

              </div>

              {/* STATS */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-8">

                <div className="relative p-[1px] rounded-2xl group">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#8F5BFF]/0 via-[#8F5BFF] to-[#6B30CE]/0 opacity-0 group-hover:opacity-100 blur-md transition duration-500" />

                  <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                    <div className="text-2xl md:text-3xl font-black">
                      <Counter end={1000} />+
                    </div>
                    <div className="text-white/60 mt-2 text-sm">тренировок</div>
                  </div>
                </div>

                <div className="relative p-[1px] rounded-2xl group">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#8F5BFF]/0 via-[#8F5BFF] to-[#6B30CE]/0 opacity-0 group-hover:opacity-100 blur-md transition duration-500" />

                  <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                    <div className="text-2xl md:text-3xl font-black">
                      <Counter end={1500} />+
                    </div>
                    <div className="text-white/60 mt-2 text-sm">ударов</div>
                  </div>
                </div>

                <div className="relative p-[1px] rounded-2xl group">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#8F5BFF]/0 via-[#8F5BFF] to-[#6B30CE]/0 opacity-0 group-hover:opacity-100 blur-md transition duration-500" />

                  <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                    <div className="text-2xl md:text-3xl font-black">24/7</div>
                    <div className="text-white/60 mt-2 text-sm">доступ</div>
                  </div>
                </div>

              </div>
            </div>

            {/* RIGHT */}
            <div className="hidden lg:flex justify-end items-center">
              <div className="relative w-full max-w-[650px] lg:ml-28 lg:mt-6 flex items-center justify-center">

                <div className="absolute w-[560px] h-[560px] orbit-spin">
                  <div className="absolute inset-0 rounded-full orbit-core" />
                </div>

                <div className="absolute w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(143,91,255,0.15),transparent_65%)] blur-2xl" />

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

      <HowItWorksModal
        open={howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
      />
    </>
  );
}
