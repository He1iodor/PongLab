"use client";

import Image from "next/image";
import Counter from "@/components/Counter";
import FloatingParticles from "@/components/FloatingParticles";
import { motion } from "framer-motion";
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
      {/* BACKGROUND */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(0,0,0,0.2),rgba(9,11,24,0.95))]" />

      {/* PARTICLES */}
      <div className="absolute inset-0 pointer-events-none z-10">
        <FloatingParticles />
      </div>

      {/* GLOW */}
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
              <button className="rounded-2xl px-8 py-4 font-semibold leading-none bg-[#6B30CE] hover:scale-105 transition">
                Попробовать
              </button>

              <button className="rounded-2xl border border-white/10 bg-white/5 px-8 py-4 backdrop-blur-xl leading-none">
                Смотреть видео
              </button>
            </div>

            {/* CARDS (ближе к кнопкам) */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-8">

              <div className="relative p-[1px] rounded-2xl group">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#8F5BFF]/0 via-[#8F5BFF] to-[#6B30CE]/0 opacity-0 group-hover:opacity-100 blur-md transition duration-500" />

                <div className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 opacity-80 group-hover:opacity-100 transition flex flex-col items-center text-center">
                  <div className="text-2xl md:text-3xl font-black">
                    <Counter end={1000} />+
                  </div>
                  <div className="text-white/60 mt-2 text-sm">тренировок</div>
                </div>
              </div>

              <div className="relative p-[1px] rounded-2xl group">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#8F5BFF]/0 via-[#8F5BFF] to-[#6B30CE]/0 opacity-0 group-hover:opacity-100 blur-md transition duration-500" />

                <div className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 opacity-80 group-hover:opacity-100 transition flex flex-col items-center text-center">
                  <div className="text-2xl md:text-3xl font-black">
                    <Counter end={1500} />+
                  </div>
                  <div className="text-white/60 mt-2 text-sm">ударов</div>
                </div>
              </div>

              <div className="relative p-[1px] rounded-2xl group">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#8F5BFF]/0 via-[#8F5BFF] to-[#6B30CE]/0 opacity-0 group-hover:opacity-100 blur-md transition duration-500" />

                <div className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 opacity-80 group-hover:opacity-100 transition flex flex-col items-center text-center">
                  <div className="text-2xl md:text-3xl font-black">24/7</div>
                  <div className="text-white/60 mt-2 text-sm">доступ</div>
                </div>
              </div>

            </div>
          </div>

          {/* RIGHT */}

<div className="hidden lg:flex justify-end items-center">
  <div className="relative w-full max-w-[700px] lg:ml-28">

    <motion.div
      animate={{
        y: [0, -20, 0],
      }}
      transition={{
        duration: 6,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className="relative flex items-center justify-center"
    >

      {/* MAIN GLOW */}

      <div
        className="
        absolute
        w-[650px]
        h-[650px]
        rounded-full
        bg-[#6B30CE]
        opacity-20
        blur-[160px]
        "
      />

      {/* OUTER RING */}

      <motion.div
        animate={{ rotate: 360 }}
        transition={{
          duration: 40,
          repeat: Infinity,
          ease: "linear",
        }}
        className="
        absolute
        w-[600px]
        h-[600px]
        rounded-full
        border
        border-[#8F5BFF]/20
        "
      />

      {/* INNER RING */}

      <motion.div
        animate={{ rotate: -360 }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "linear",
        }}
        className="
        absolute
        w-[500px]
        h-[500px]
        rounded-full
        border
        border-[#8F5BFF]/40
        "
      />

      {/* ROBOT */}

      <Image
        src="/bot.png"
        alt="Robot"
        width={700}
        height={700}
        className="
        relative
        z-20
        w-[520px]
        h-auto
        drop-shadow-[0_0_140px_rgba(107,48,206,.8)]
        "
      />

      {/* CARD 1 */}

      <div
        className="
        absolute
        top-[70px]
        left-[20px]
        z-30
        rounded-2xl
        border
        border-white/10
        bg-white/5
        backdrop-blur-xl
        px-5
        py-3
        "
      >
        <div className="text-xs text-white/50">
          AI Accuracy
        </div>

        <div className="font-bold text-[#8F5BFF]">
          98.7%
        </div>
      </div>

      {/* CARD 2 */}

      <div
        className="
        absolute
        bottom-[80px]
        right-[20px]
        z-30
        rounded-2xl
        border
        border-white/10
        bg-white/5
        backdrop-blur-xl
        px-5
        py-3
        "
      >
        <div className="text-xs text-white/50">
          Ball Tracking
        </div>

        <div className="font-bold text-[#8F5BFF]">
          LIVE
        </div>
      </div>

      {/* CARD 3 */}

      <div
        className="
        absolute
        top-[220px]
        right-[-10px]
        z-30
        rounded-2xl
        border
        border-white/10
        bg-white/5
        backdrop-blur-xl
        px-5
        py-3
        "
      >
        <div className="text-xs text-white/50">
          Reaction Speed
        </div>

        <div className="font-bold text-[#8F5BFF]">
          0.04s
        </div>
      </div>

    </motion.div>

  </div>
</div>

        </div>
      </div>
    </section>
  );
}
