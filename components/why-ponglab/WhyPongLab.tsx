
"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  Clock3,
  Footprints,
  Moon,
  Sun,
  Target,
  Trophy,
  Users,
  Zap,
  SlidersHorizontal,
  Activity,
  Timer,
  CircleDot,
} from "lucide-react";

const purple = "#A879FF";

const sectionMotion = {
  hidden: { opacity: 0, y: 35 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] },
  },
};

function SectionNumber({ number }: { number: string }) {
  return (
    <div className="shrink-0 text-[54px] font-black leading-none tracking-[-0.06em] text-[#A879FF] drop-shadow-[0_0_22px_rgba(168,121,255,.35)] sm:text-[64px]">
      {number}
    </div>
  );
}

function SectionHeading({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <h2 className="text-lg font-bold leading-[1.2] tracking-[-0.025em] text-white sm:text-xl">
      {children}
    </h2>
  );
}

function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.09] bg-gradient-to-br from-white/[0.065] to-white/[0.018] shadow-[inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

function FeatureTile({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -5, borderColor: "rgba(168,121,255,.42)" }}
      transition={{ duration: 0.35 }}
      className="group flex min-h-[142px] flex-col rounded-2xl border border-white/[0.09] bg-white/[0.035] p-4 transition-colors hover:bg-[#A879FF]/[0.07]"
    >
      <Icon
        size={25}
        strokeWidth={1.8}
        className="mb-3 text-[#B78BFF] transition-transform duration-500 group-hover:scale-110"
      />
      <h3 className="text-sm font-bold leading-tight text-white">
        {title}
      </h3>
      <p className="mt-2 text-xs leading-[1.55] text-white/55">
        {description}
      </p>
    </motion.div>
  );
}

function ScheduleTile({
  icon: Icon,
  title,
}: {
  icon: React.ElementType;
  title: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.09] bg-white/[0.035] px-3 py-5 transition-colors hover:border-[#A879FF]/40 hover:bg-[#A879FF]/[0.07]"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#A879FF]/55 bg-[#A879FF]/[0.07] shadow-[0_0_25px_rgba(168,121,255,.08)]">
        <Icon size={26} strokeWidth={1.6} className="text-[#C6A5FF]" />
      </div>
      <span className="text-sm font-medium text-white/85">{title}</span>
    </motion.div>
  );
}

function ComparisonMark({ value }: { value: boolean | "partial" }) {
  if (value === "partial") {
    return <span className="text-xs text-white/60">Частично</span>;
  }

  return value ? (
    <Check size={17} strokeWidth={3} className="mx-auto text-[#B78BFF]" />
  ) : (
    <span className="text-white/35">—</span>
  );
}

function CoachIllustration() {
  return (
    <svg
      viewBox="0 0 520 300"
      role="img"
      aria-label="Тренер объясняет технику игроку"
      className="h-auto w-full overflow-visible"
      fill="none"
    >
      <defs>
        <linearGradient id="coachJersey" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B78BFF" />
          <stop offset="1" stopColor="#542B91" />
        </linearGradient>
        <linearGradient id="playerJersey" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8D5BD2" />
          <stop offset="1" stopColor="#302044" />
        </linearGradient>
        <radialGradient id="coachGlow">
          <stop stopColor="#A879FF" stopOpacity=".34" />
          <stop offset="1" stopColor="#A879FF" stopOpacity="0" />
        </radialGradient>
        <filter id="softGlow">
          <feGaussianBlur stdDeviation="15" />
        </filter>
      </defs>

      <ellipse
        cx="270"
        cy="250"
        rx="230"
        ry="65"
        fill="url(#coachGlow)"
        filter="url(#softGlow)"
      />
      <path
        d="M35 250 C95 95 390 40 485 225"
        stroke="#A879FF"
        strokeOpacity=".32"
        strokeWidth="1.5"
      />
      <path
        d="M55 265 C155 145 360 115 470 255"
        stroke="#A879FF"
        strokeOpacity=".17"
        strokeWidth="1"
      />

      {/* Игрок */}
      <path
        d="M48 285 C53 229 70 191 111 176 C143 165 184 183 198 215 L214 285Z"
        fill="url(#playerJersey)"
        stroke="#B78BFF"
        strokeOpacity=".55"
        strokeWidth="2"
      />
      <path
        d="M111 173 C95 151 94 120 106 94 C118 69 150 65 171 81 C192 97 191 132 174 158 L157 180Z"
        fill="#D49A79"
      />
      <path
        d="M104 118 C89 83 112 49 150 47 C186 45 203 76 187 112 C181 94 164 86 146 89 C130 92 120 105 104 118Z"
        fill="#17131E"
      />
      <path
        d="M129 139 Q144 146 160 137"
        stroke="#6B3E3D"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M118 119 Q128 114 138 119"
        stroke="#251B26"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M157 119 Q167 113 177 118"
        stroke="#251B26"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M143 155 L143 180 L171 194"
        stroke="#D49A79"
        strokeWidth="15"
        strokeLinecap="round"
      />
      <path
        d="M174 191 L224 215"
        stroke="#D49A79"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <path
        d="M212 210 L234 193"
        stroke="#D49A79"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <ellipse
        cx="240"
        cy="185"
        rx="18"
        ry="26"
        transform="rotate(38 240 185)"
        fill="#20152E"
        stroke="#C5A2FF"
        strokeWidth="3"
      />
      <path
        d="M240 166 L249 178"
        stroke="#A879FF"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Тренер */}
      <path
        d="M245 285 C256 219 287 178 341 169 C388 162 428 198 442 285Z"
        fill="url(#coachJersey)"
        stroke="#C4A0FF"
        strokeOpacity=".65"
        strokeWidth="2"
      />
      <path
        d="M317 167 C296 145 294 107 309 78 C326 47 367 45 390 67 C413 89 406 130 385 158 L366 177Z"
        fill="#DFA783"
      />
      <path
        d="M305 105 C294 69 321 34 359 32 C399 30 421 62 403 104 C388 79 366 73 346 79 C329 84 317 96 305 105Z"
        fill="#21192A"
      />
      <path
        d="M331 130 Q349 139 369 127"
        stroke="#784D48"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M326 109 Q338 103 347 108"
        stroke="#281C29"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M365 106 Q377 100 387 105"
        stroke="#281C29"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M342 161 L342 187 L319 203"
        stroke="#DFA783"
        strokeWidth="15"
        strokeLinecap="round"
      />
      <path
        d="M319 203 L280 185"
        stroke="#DFA783"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <path
        d="M280 185 L262 171"
        stroke="#DFA783"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M366 163 L389 188"
        stroke="#DFA783"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M389 188 L419 170"
        stroke="#DFA783"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M280 185 L263 171"
        stroke="#DFA783"
        strokeWidth="12"
        strokeLinecap="round"
      />

      {/* Планшет тренера */}
      <rect
        x="370"
        y="191"
        width="67"
        height="48"
        rx="7"
        transform="rotate(-12 370 191)"
        fill="#151020"
        stroke="#B78BFF"
        strokeWidth="2"
      />
      <path
        d="M385 208 L421 201 M386 217 L412 212"
        stroke="#B78BFF"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Акцентные элементы */}
      <circle cx="80" cy="68" r="4" fill="#C6A5FF" />
      <circle cx="457" cy="83" r="5" fill="#A879FF" />
      <circle cx="468" cy="96" r="2" fill="#E4D5FF" />
    </svg>
  );
}

export default function WhyPongLab() {
  const reducedMotion = useReducedMotion();

  const reveal = reducedMotion
    ? {}
    : {
        initial: "hidden" as const,
        whileInView: "visible" as const,
        viewport: { once: true, amount: 0.16 },
        variants: sectionMotion,
      };

  const comparisonRows = [
    {
      name: "Больше количество повторений",
      pong: true,
      coach: "partial" as const,
    },
    {
      name: "Отработка одного элемента",
      pong: true,
      coach: true,
    },
    {
      name: "Тактический разбор",
      pong: false,
      coach: true,
    },
    {
      name: "Исправление техники",
      pong: false,
      coach: true,
    },
    {
      name: "Самостоятельные тренировки",
      pong: true,
      coach: false,
    },
    {
      name: "Гибкий график",
      pong: true,
      coach: "partial" as const,
    },
  ];

  return (
    <main className="relative mx-auto w-full max-w-[1480px] text-white">
      {/* Фоновое оформление */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 top-40 h-[480px] w-[480px] rounded-full bg-[#6B30CE]/10 blur-[150px]" />
        <div className="absolute -right-40 top-[38%] h-[520px] w-[520px] rounded-full bg-[#8F5BFF]/10 blur-[170px]" />
        <div className="absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-[#4A7DFF]/[0.06] blur-[160px]" />
      </div>

      <div className="flex flex-col gap-5 sm:gap-7">

        {/* HERO */}
        <motion.section
          initial={reducedMotion ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative isolate overflow-hidden rounded-[26px] border border-white/10 bg-[#0B0D19]/90"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_78%_48%,rgba(143,91,255,.20),transparent_48%),linear-gradient(115deg,rgba(255,255,255,.035),transparent_55%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[.10] [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:48px_48px]" />

          <div className="relative grid items-center gap-2 px-6 pb-5 pt-8 sm:px-9 md:min-h-[330px] md:grid-cols-[1.05fr_.95fr] md:px-12 md:py-9 lg:px-14">
            <div className="relative z-20">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#8F5BFF]/30 bg-[#8F5BFF]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[.18em] text-[#CDAEFF]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#A978FF] shadow-[0_0_12px_#A978FF]" />
                Эффективность PongLab
              </div>

              <h1 className="max-w-[700px] text-[clamp(2rem,4.2vw,4.25rem)] font-black leading-[.98] tracking-[-.045em] text-white">
                До 10 раз больше
                <span className="block bg-gradient-to-r from-[#B78BFF] via-[#9C6BFF] to-[#D6B9FF] bg-clip-text text-transparent">
                  игровых повторений
                </span>
                за тренировку
              </h1>
            </div>

            <motion.div
              animate={reducedMotion ? undefined : { y: [0, -7, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="relative mx-auto h-[210px] w-full max-w-[440px] md:absolute md:inset-y-0 md:right-0 md:h-full md:w-[48%] md:max-w-none"
            >
              <div className="pointer-events-none absolute right-[8%] top-1/2 aspect-square w-[78%] -translate-y-1/2 rounded-full border border-[#9C6BFF]/20 shadow-[0_0_70px_rgba(143,91,255,.13)]" />
              <div className="pointer-events-none absolute right-[16%] top-1/2 aspect-square w-[60%] -translate-y-1/2 rounded-full border border-white/[.07]" />
              <Image
                src="/why-ponglab/robot-serve.webp"
                alt="Робот PongLab выполняет подачу мяча"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 48vw"
                className="object-contain object-center drop-shadow-[0_25px_65px_rgba(143,91,255,.25)]"
              />
            </motion.div>

            <div className="relative z-20 max-w-[610px] border-l border-[#A879FF]/35 pl-4 text-sm leading-7 text-white/65 sm:text-base md:col-start-1 md:mt-5">
              Каждая подача превращается в возможность отработать технику,
              скорость реакции и стабильность без пауз и ожидания.
            </div>
          </div>
        </motion.section>

        {/* 1. БОЛЬШЕ ПРАКТИКИ */}
        <motion.section
          {...reveal}
          className="grid gap-5 rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-5 sm:p-7 lg:grid-cols-[.9fr_2.1fr] lg:items-center lg:gap-8"
        >
          <div className="flex items-start gap-4">
            <SectionNumber number="1" />
            <div>
              <SectionHeading>
                Больше практики.
                <br />
                Меньше ожидания.
              </SectionHeading>
              <div className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                100%
              </div>
              <p className="mt-1 text-sm text-white/65">
                времени посвящено тренировке.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <GlassCard className="p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-3">
                <Timer className="text-[#B78BFF]" size={22} />
                <h3 className="text-sm font-bold">Обычная тренировка</h3>
              </div>
              <div className="flex gap-1">
                {["Подача", "Пауза", "Объяснение", "Подача", "Пауза", "…"].map(
                  (item, index) => (
                    <div
                      key={index}
                      className={`flex h-3 flex-1 items-center justify-center rounded-full ${
                        index === 0 || index === 3
                          ? "bg-gradient-to-r from-[#A879FF] to-[#7542C5]"
                          : "bg-white/10"
                      }`}
                    />
                  )
                )}
              </div>
              <p className="mt-3 text-xs text-white/55">
                Время уходит на паузы и организацию процесса
              </p>
            </GlassCard>

            <GlassCard className="border-[#A879FF]/35 bg-[#8F5BFF]/[0.07] p-4 shadow-[0_0_35px_rgba(143,91,255,.08)] sm:p-5">
              <div className="mb-4 flex items-center gap-3">
                <Zap className="text-[#C6A5FF]" size={22} />
                <h3 className="text-sm font-bold">Тренировка с PongLab</h3>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 8 }).map((_, index) => (
                  <motion.div
                    key={index}
                    initial={reducedMotion ? false : { opacity: 0.3 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.09, duration: 0.45 }}
                    className="h-3 flex-1 rounded-full bg-gradient-to-r from-[#A879FF] to-[#D4B8FF] shadow-[0_0_12px_rgba(168,121,255,.3)]"
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-[#D7C2FF]">
                Максимум времени на игровые повторения
              </p>
            </GlassCard>
          </div>
        </motion.section>

        {/* 2. ЦЕЛЕВАЯ ОТРАБОТКА */}
        <motion.section
          {...reveal}
          className="grid gap-5 rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-5 sm:p-7 lg:grid-cols-[.85fr_2.15fr] lg:items-center lg:gap-8"
        >
          <div className="flex items-start gap-4">
            <SectionNumber number="2" />
            <div>
              <SectionHeading>
                Отрабатывайте именно то,
                что хотите улучшить.
              </SectionHeading>
              <p className="mt-3 max-w-[330px] text-sm leading-6 text-white/60">
                Робот способен повторять один и тот же сценарий сотни раз
                подряд с одинаковой точностью.
              </p>
              <p className="mt-3 text-sm font-semibold text-[#C6A5FF]">
                Повторяемость помогает закреплять технику.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FeatureTile
              icon={Target}
              title="Форхенд"
              description="Отработка атакующего удара справа"
            />
            <FeatureTile
              icon={Activity}
              title="Бэкхенд"
              description="Работа над ударом слева"
            />
            <FeatureTile
              icon={Zap}
              title="Приём подачи"
              description="Реакция на разные подачи"
            />
            <FeatureTile
              icon={Footprints}
              title="Работа ног"
              description="Перемещения и позиция у стола"
            />
          </div>
        </motion.section>

        {/* 3. СВОБОДНОЕ РАСПИСАНИЕ */}
        <motion.section
          {...reveal}
          className="grid gap-5 rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-5 sm:p-7 lg:grid-cols-[.85fr_2.15fr] lg:items-center lg:gap-8"
        >
          <div className="flex items-start gap-4">
            <SectionNumber number="3" />
            <div>
              <SectionHeading>
                Тренируйтесь тогда,
                когда удобно вам.
              </SectionHeading>
              <p className="mt-3 max-w-[340px] text-sm leading-6 text-white/60">
                Не нужно подстраиваться под расписание тренера или искать
                партнёра для игры. Вы сами выбираете время тренировки
                и её продолжительность.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ScheduleTile icon={Sun} title="Утро" />
            <ScheduleTile icon={Sun} title="День" />
            <ScheduleTile icon={Moon} title="Вечер" />
            <ScheduleTile icon={CalendarDays} title="Выходные" />
          </div>
        </motion.section>

        {/* 4. 1000+ УДАРОВ */}
        <motion.section
          {...reveal}
          className="relative overflow-hidden rounded-[24px] border border-[#A879FF]/25 bg-[#100D1D]/85 px-5 py-9 text-center shadow-[0_0_45px_rgba(143,91,255,.07)] sm:py-12"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(143,91,255,.20),transparent_60%)]" />
          <div className="pointer-events-none absolute left-0 top-1/2 h-px w-full bg-gradient-to-r from-transparent via-[#A879FF]/60 to-transparent" />
          <div className="relative z-10">
            <div className="text-[clamp(4rem,11vw,8.5rem)] font-black leading-[.9] tracking-[-.065em] text-white [text-shadow:0_0_28px_rgba(168,121,255,.65)]">
              <span className="bg-gradient-to-b from-white via-[#DCC8FF] to-[#A879FF] bg-clip-text text-transparent">
                1000+
              </span>
            </div>
            <h2 className="mt-4 text-lg font-extrabold uppercase tracking-[.025em] text-white sm:text-2xl">
              Ударов за тренировку
            </h2>
            <p className="mx-auto mt-3 max-w-[650px] text-sm leading-6 text-white/60">
              Чем больше качественных повторений, тем быстрее формируется
              стабильный игровой навык.
            </p>
          </div>
        </motion.section>

        {/* 5. ВОЗМОЖНОСТИ */}
        <motion.section
          {...reveal}
          className="grid gap-5 rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-5 sm:p-7 lg:grid-cols-[.8fr_2.2fr] lg:items-start lg:gap-8"
        >
          <div className="flex items-start gap-4">
            <SectionNumber number="5" />
            <div>
              <SectionHeading>
                PongLab — это больше,
                чем робот.
              </SectionHeading>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <FeatureTile
              icon={ChartNoAxesCombined}
              title="Статистика тренировок"
              description="Отслеживайте свою активность и прогресс."
            />
            <FeatureTile
              icon={SlidersHorizontal}
              title="Индивидуальные режимы"
              description="Создавайте собственные сценарии подачи."
            />
            <FeatureTile
              icon={Trophy}
              title="Классическая партия"
              description="Приводите друзей, соперничайте или пробуйте новое."
            />
            <FeatureTile
              icon={Users}
              title="Турниры участников"
              description="Соревнуйтесь с другими игроками."
            />
            <FeatureTile
              icon={Activity}
              title="Аналитика развития"
              description="Видьте результаты своей работы."
            />
          </div>
        </motion.section>

        {/* 6. PONGLAB И ТРЕНЕР */}
        <motion.section
          {...reveal}
          className="grid gap-6 rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-5 sm:p-7 lg:grid-cols-[.82fr_1.18fr] lg:items-center lg:gap-8"
        >
          <div className="flex items-start gap-4">
            <SectionNumber number="6" />
            <div>
              <SectionHeading>
                PongLab и тренер
                дополняют друг друга.
              </SectionHeading>
              <p className="mt-4 text-sm font-semibold text-[#C6A5FF]">
                Они не конкурируют,
                <br />
                а усиливают результат.
              </p>
              <p className="mt-3 max-w-[340px] text-sm leading-6 text-white/60">
                Наилучший результат достигается при сочетании самостоятельных
                тренировок в PongLab и периодических занятий с тренером.
              </p>
            </div>
          </div>

          <div className="grid items-center gap-4 md:grid-cols-[1.1fr_.9fr]">
            <GlassCard className="overflow-hidden p-2 sm:p-3">
              <div className="overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_50%_90%,rgba(143,91,255,.18),transparent_65%)]">
                <CoachIllustration />
              </div>
            </GlassCard>

            <div className="overflow-hidden rounded-xl border border-white/10">
              <div className="grid grid-cols-[1.5fr_.8fr_.8fr] bg-white/[0.06] text-[11px] font-bold sm:text-xs">
                <div className="p-2.5">Задача</div>
                <div className="border-l border-white/10 p-2.5 text-center">
                  PongLab
                </div>
                <div className="border-l border-white/10 p-2.5 text-center">
                  Тренер
                </div>
              </div>

              {comparisonRows.map((row, index) => (
                <div
                  key={row.name}
                  className="grid grid-cols-[1.5fr_.8fr_.8fr] border-t border-white/[0.08] text-[10px] sm:text-[11px]"
                >
                  <div className="flex items-center p-2 text-white/75">
                    {row.name}
                  </div>
                  <div className="flex items-center justify-center border-l border-white/[0.08] p-2">
                    <ComparisonMark value={row.pong} />
                  </div>
                  <div className="flex items-center justify-center border-l border-white/[0.08] p-2">
                    <ComparisonMark value={row.coach} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* CTA */}
        <motion.section
          {...reveal}
          className="relative overflow-hidden rounded-[24px] border border-[#A879FF]/35 bg-gradient-to-r from-[#171126] via-[#171126] to-[#211438] p-6 shadow-[0_0_45px_rgba(143,91,255,.08)] sm:p-8"
        >
          <div className="pointer-events-none absolute -right-20 -top-32 h-72 w-72 rounded-full bg-[#8F5BFF]/20 blur-[100px]" />

          <div className="relative grid items-center gap-6 lg:grid-cols-[1.1fr_1.2fr_auto]">
            <div>
              <h2 className="text-xl font-black leading-tight sm:text-2xl">
                Каждая тренировка приближает
                <br className="hidden sm:block" />
                вас к следующему уровню.
              </h2>
            </div>

            <p className="text-sm leading-6 text-white/60">
              Тренируйтесь тогда, когда удобно. Работайте над тем, что
              действительно важно. Получайте больше качественной практики
              за каждую минуту у стола.
            </p>

            <div className="flex flex-col items-start gap-3 lg:items-center">
              <Link
                href="/pricing"
                className="group inline-flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#7540C7] to-[#9B65F0] px-7 py-4 text-sm font-bold text-white shadow-[0_8px_30px_rgba(143,91,255,.25)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(143,91,255,.4)] sm:w-auto"
              >
                Выбрать тариф
                <ArrowRight
                  size={18}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </Link>
              <span className="text-xs text-white/65">
                От 499 ₽ за тренировку
              </span>
            </div>
          </div>
        </motion.section>
      </div>
    </main>
  );
}
