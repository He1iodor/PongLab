"use client";

import { motion } from "framer-motion";

const steps = [
  {
    number: "01",
    title: "Робот подает мячи",
    text: "Автоматическая подача с регулируемой скоростью, вращением и траекторией.",
  },
  {
    number: "02",
    title: "AI анализирует удары",
    text: "Система отслеживает технику, скорость реакции и качество выполнения.",
  },
  {
    number: "03",
    title: "Получай рекомендации",
    text: "После тренировки получаешь персональную аналитику и план улучшений.",
  },
];

export default function HowItWorks() {
  return (
    <section
  id="how-it-works"
  className="relative py-32 overflow-hidden"
>

      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#101425] to-transparent" />

      <div className="relative z-10 mx-auto max-w-[1400px] px-6">

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: .6 }}
          className="text-center"
        >
          <div
            className="
            inline-flex
            rounded-full
            border
            border-[#8F5BFF]/20
            bg-[#8F5BFF]/10
            px-4
            py-2
            text-xs
            tracking-[2px]
            text-[#B088FF]
            "
          >
            КАК ЭТО РАБОТАЕТ
          </div>

          <h2
            className="
            mt-6
            text-4xl
            md:text-6xl
            font-black
            "
          >
            Тренировка нового поколения
          </h2>

          <p
            className="
            mt-6
            max-w-[700px]
            mx-auto
            text-white/60
            text-lg
            "
          >
            Робот, аналитика и искусственный интеллект работают
            вместе, чтобы ускорить твой прогресс.
          </p>
        </motion.div>

        <div className="mt-24 grid md:grid-cols-3 gap-8">

          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{
                opacity: 0,
                y: 80,
              }}
              whileInView={{
                opacity: 1,
                y: 0,
              }}
              viewport={{
                once: true,
              }}
              transition={{
                delay: index * .15,
                duration: .6,
              }}
              whileHover={{
                y: -10,
              }}
              className="
              relative
              rounded-[32px]
              border
              border-white/10
              bg-white/5
              backdrop-blur-xl
              p-8
              overflow-hidden
              "
            >
              <div
                className="
                absolute
                -right-10
                -top-10
                h-40
                w-40
                rounded-full
                bg-[#6B30CE]
                opacity-20
                blur-[80px]
                "
              />

              <div
                className="
                text-[#8F5BFF]
                text-sm
                font-bold
                tracking-[3px]
                "
              >
                {step.number}
              </div>

              <h3
                className="
                mt-4
                text-2xl
                font-bold
                "
              >
                {step.title}
              </h3>

              <p
                className="
                mt-4
                text-white/60
                leading-7
                "
              >
                {step.text}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
