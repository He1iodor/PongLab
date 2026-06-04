"use client";

import Image from "next/image";
import Counter from "@/components/Counter";
import FloatingParticles from "@/components/FloatingParticles";
import { useEffect, useRef } from "react";

export default function Hero() {
  const mouse = useRef({ x: 0, y: 0 });
  const scrollY = useRef(0);

  const glowRef = useRef<HTMLDivElement | null>(null);
  const botRef = useRef<HTMLDivElement | null>(null);
  const particlesRef = useRef<HTMLDivElement | null>(null);
  const bgRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onScroll = () => {
      scrollY.current = window.scrollY;
    };

    window.addEventListener("scroll", onScroll);

    let x = 0;
    let y = 0;

    const animate = () => {
      // smooth mouse follow (ONLY glow)
      x += (mouse.current.x - x) * 0.12;
      y += (mouse.current.y - y) * 0.12;

      const scroll = scrollY.current;

      // glow (mouse-based)
      if (glowRef.current) {
        glowRef.current.style.transform =
          `translate3d(${x - 150}px, ${y - 150}px, 0)`;
      }

      // particles (light scroll drift)
      if (particlesRef.current) {
        particlesRef.current.style.transform =
          `translate3d(0px, ${scroll * 0.05}px, 0)`;
      }

      // background (slower scroll)
      if (bgRef.current) {
        bgRef.current.style.transform =
          `translate3d(0px, ${scroll * 0.03}px, 0)`;
      }

      // BOT (main scroll parallax)
      if (botRef.current) {
        botRef.current.style.transform =
          `translate3d(0px, ${scroll * 0.12}px, 0)`;
      }

      requestAnimationFrame(animate);
    };

    animate();

    return () => window.removeEventListener("scroll", onScroll);
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
      <div
        ref={bgRef}
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(0,0,0,0.2),rgba(9,11,24,0.95))]"
      />

      {/* PARTICLES */}
      <div
        ref={particlesRef}
        className="absolute inset-0 pointer-events-none z-10"
      >
        <FloatingParticles />
      </div>

      {/* GLOW */}
      <div
        ref={glowRef}
        className="absolute z-20 w-[320px] h-[320px] rounded-full bg-[#8F5BFF] opacity-25 blur-[120px] pointer-events-none"
      />

      {/* CONTENT */}
      <div className="relative z-30 mx-auto max-w-[1400px] px-6">
        <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 items-center gap-12">

          {/* LEFT */}
          <div className="max-w-[700px]">
            <h1 className="mt-8 text-5xl md:text-8xl font-black leading-[0.95]">
              <br />
              Тренируйся
              <br />
              умнее.
              <br />
              <span className="text-[#8F5BFF]">Играй сильнее.</span>
            </h1>

            <p className="mt-8 max-w-[620px] text-base md:text-lg leading-7 md:leading-8 text-white/70">
              Персональные тренировки с роботизированной подачей,
              аналитикой и тысячами качественных повторений
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

          {/* RIGHT (BOT scroll parallax) */}
          <div className="hidden lg:flex justify-center items-center">
            <div
              ref={botRef}
              className="relative w-full max-w-[520px] will-change-transform"
            >
              <Image
                src="/bot.png"
                alt="Robot Training"
                width={300}
                height={300}
                className="w-[420px] lg:w-[520px] h-auto drop-shadow-[0_0_120px_rgba(107,48,206,.6)]"
              />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
