"use client";

import { motion } from "framer-motion";

export default function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden">

      <div
        className="
        absolute
        top-[-200px]
        right-[-150px]
        h-[700px]
        w-[700px]
        rounded-full
        bg-[#6B30CE]
        opacity-20
        blur-[180px]
        "
      />

      <div
        className="
        absolute
        bottom-[-250px]
        left-[-150px]
        h-[600px]
        w-[600px]
        rounded-full
        bg-[#8F5BFF]
        opacity-10
        blur-[200px]
        "
      />

      <div className="container mx-auto px-6">

        <div
          className="
          flex
          min-h-screen
          items-center
          justify-between
          gap-10
          "
        >

          <div className="max-w-[700px]">

            <div
              className="
              mb-6
              inline-flex
              rounded-full
              border
              border-white/10
              bg-white/5
              px-5
              py-2
              text-xs
              tracking-[2px]
              text-[#B088FF]
              "
            >
              УМНЫЕ ТРЕНИРОВКИ НОВОГО ПОКОЛЕНИЯ
            </div>

            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="
              text-6xl
              font-black
              leading-[0.95]
              md:text-8xl
              "
            >
              Тренируйся
              <br />
              умнее.
              <br />
              <span className="text-[#8F5BFF]">
                Играй сильнее.
              </span>
            </motion.h1>

            <p
              className="
              mt-8
              max-w-[600px]
              text-lg
              leading-8
              text-white/70
              "
            >
              Роботизированные тренировки,
              аналитика и тысячи качественных
              повторений для быстрого роста.
            </p>

          </div>

          <motion.div
            animate={{
              y: [0, -20, 0],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
            }}
            className="
            hidden
            lg:flex
            relative
            h-[700px]
            w-[700px]
            items-center
            justify-center
            "
          >
            <div
              className="
              absolute
              h-[500px]
              w-[500px]
              rounded-full
              bg-[#6B30CE]
              opacity-30
              blur-[120px]
              "
            />

            <div
              className="
              h-[520px]
              w-[520px]
              rounded-[40px]
              border
              border-white/10
              bg-white/5
              backdrop-blur-xl
              "
            />
          </motion.div>

        </div>
      </div>
    </section>
  );
}