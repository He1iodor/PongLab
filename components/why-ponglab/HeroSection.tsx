"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: {
    opacity: 0,
    y: 40,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[#090B18]">

      {/* Background */}

      <div className="absolute inset-0">

        <div className="absolute inset-0 bg-[#090B18]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_50%,rgba(107,48,206,.28),transparent_45%)]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(107,48,206,.12),transparent_35%)]" />

        <div className="absolute inset-0 bg-gradient-to-r from-[#090B18] via-[#090B18]/75 to-transparent z-10" />

        {/* Purple Glow */}

<div className="absolute left-[-220px] top-1/2 h-[760px] w-[760px] -translate-y-1/2 rounded-full bg-[#6B30CE]/25 blur-[180px]" />

<div className="absolute right-[-120px] bottom-[-120px] h-[420px] w-[420px] rounded-full bg-[#6B30CE]/12 blur-[120px]" />

      </div>

      {/* Content */}

      <div className="relative z-20 mx-auto max-w-[1650px]">

        <div className="grid lg:grid-cols-[1.05fr_.95fr] min-h-[760px]">

          {/* LEFT */}

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="flex flex-col justify-center px-14 py-20 xl:px-24"
          >

            <span className="inline-flex w-fit rounded-full border border-[#6B30CE]/40 bg-[#6B30CE]/10 px-5 py-2 text-sm tracking-[0.18em] uppercase text-[#C9AEFF]">

              Почему PongLab

            </span>

            <h1 className="mt-10 max-w-[760px] text-[72px] font-black leading-[0.95] tracking-[-0.05em] text-white">

              До 10 раз
              <br />
              больше
              <br />
              повторений
              <br />
              за тренировку

            </h1>

            <p className="mt-10 max-w-[560px] text-[22px] leading-[1.75] text-white/65">

              Робот поддерживает постоянный темп игры,
              благодаря чему всё внимание направлено
              только на технику, стабильность
              и совершенствование каждого удара.

            </p>

            <div className="mt-14 flex gap-8">

    <div>

        <div className="text-[58px] font-black text-white">

            1000+

        </div>

        <div className="mt-2 text-white/45">

            ударов за тренировку

        </div>

    </div>

    <div className="h-16 w-px bg-white/10" />

    <div>

        <div className="text-[58px] font-black text-white">

            5–10×

        </div>

        <div className="mt-2 text-white/45">

            больше повторений

        </div>

    </div>

</div>

          </motion.div>

         {/* RIGHT */}

<div className="relative flex items-end justify-center">

    {/* Decorative Number */}

    <div className="absolute right-16 top-20 z-10 text-[280px] font-black leading-none tracking-[-0.08em] text-white/[0.03]">

        01

    </div>

    {/* Glow */}

    <div className="absolute right-[10%] top-[20%] h-[420px] w-[420px] rounded-full bg-[#6B30CE]/30 blur-[130px]" />

    {/* Robot */}

    <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{
            duration: .9,
            delay: .2
        }}
        className="relative z-20 h-[760px] w-full"
    >

        <Image
            src="/images/why-ponglab/hero-bg.png"
            alt="Robot"
            fill
            priority
            className="object-contain object-right-bottom select-none pointer-events-none"
        />

    </motion.div>

</div>

            </div>

          </div>

    </section>
  );
}
