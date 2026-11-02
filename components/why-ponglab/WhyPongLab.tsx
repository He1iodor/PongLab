
"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  CircleDot,
  Footprints,
  Moon,
  SlidersHorizontal,
  Sun,
  Target,
  Timer,
  Trophy,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const easeSmooth = [0.22, 1, 0.36, 1] as const;

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.section
      initial={reduced ? false : { opacity: 0, y: 14 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{
        duration: 0.85,
        delay,
        ease: easeSmooth,
      }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function NumberBlock({ n }: { n: string }) {
  return (
    <div className="w-[52px] shrink-0 text-[54px] font-black leading-[.9] tracking-[-.07em] text-[#B78BFF] drop-shadow-[0_0_17px_rgba(168,121,255,.45)] sm:w-[62px] sm:text-[64px]">
      {n}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[15px] font-extrabold leading-[1.16] tracking-[-.025em] text-white sm:text-[17px]">
      {children}
    </h2>
  );
}

function SmallCard({
  icon: Icon,
  title,
  description,
  index = 0,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  index?: number;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 10 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{
        duration: 0.65,
        delay: index * 0.055,
        ease: easeSmooth,
      }}
      whileHover={reduced ? undefined : { y: -3 }}
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/[0.10] bg-gradient-to-br from-[#1A162A]/95 via-[#11101D]/95 to-[#0B0C16]/95 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.045)] transition-[border-color,box-shadow,background-color] duration-500 hover:border-[#B78BFF]/55 hover:shadow-[0_8px_24px_rgba(143,91,255,.12)] sm:p-3.5"
    >
      <div className="pointer-events-none absolute -right-8 -top-10 h-20 w-20 rounded-full bg-[#A879FF]/0 blur-2xl transition-colors duration-500 group-hover:bg-[#A879FF]/20" />
      <Icon
        size={24}
        strokeWidth={1.9}
        className="relative mb-2 text-[#C18CFF] drop-shadow-[0_0_8px_rgba(183,139,255,.5)] transition-transform duration-500 group-hover:scale-105"
      />
      <div className="relative text-[11px] font-bold leading-[1.2] text-white sm:text-xs">
        {title}
      </div>
      {description && (
        <p className="relative mt-2 text-[10px] leading-[1.35] text-white/65 sm:text-[11px]">
          {description}
        </p>
      )}
    </motion.div>
  );
}

function SkillCard({
  icon: Icon,
  title,
  index = 0,
}: {
  icon: LucideIcon;
  title: string;
  index?: number;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 9 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{
        duration: 0.65,
        delay: index * 0.055,
        ease: easeSmooth,
      }}
      whileHover={reduced ? undefined : { y: -3 }}
      className="group relative flex min-h-[82px] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/[0.10] bg-gradient-to-br from-[#19152B] to-[#0C0D18] px-2 py-3 transition-[border-color,box-shadow] duration-500 hover:border-[#B78BFF]/60 hover:shadow-[0_0_20px_rgba(143,91,255,.13)] sm:min-h-[86px]"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#A879FF]/0 to-transparent transition-colors duration-500 group-hover:from-[#A879FF]/10" />
      <Icon
        size={27}
        strokeWidth={1.8}
        className="relative text-[#C18CFF] drop-shadow-[0_0_8px_rgba(183,139,255,.55)] transition-transform duration-500 group-hover:scale-105"
      />
      <span className="relative text-center text-[11px] font-bold leading-tight text-white sm:text-xs">
        {title}
      </span>
    </motion.div>
  );
}

function ComparisonValue({
  value,
}: {
  value: "yes" | "no" | "partial";
}) {
  if (value === "yes") {
    return (
      <Check
        size={16}
        strokeWidth={3.2}
        className="mx-auto text-[#C18CFF] drop-shadow-[0_0_7px_rgba(183,139,255,.55)]"
      />
    );
  }

  if (value === "partial") {
    return (
      <span className="text-[10px] text-white/75 sm:text-[11px]">
        Частично
      </span>
    );
  }

  return <span className="text-white/55">—</span>;
}

/*
 * Новая иллюстрация:
 * тренер показывает ученику положение ракетки и объясняет технику.
 * Векторная графика встроена в компонент — отдельный файл не нужен.
 */
function CoachArtwork() {
  return (
    <svg
      viewBox="0 0 560 340"
      className="h-full w-full overflow-visible"
      role="img"
      aria-label="Тренер показывает ученику технику игры в настольный теннис"
      fill="none"
    >
      <defs>
        <linearGradient id="coachClothes" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#D9BDFF" />
          <stop offset=".45" stopColor="#9256D5" />
          <stop offset="1" stopColor="#34204F" />
        </linearGradient>

        <linearGradient id="studentClothes" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#B994F0" />
          <stop offset=".5" stopColor="#7045A5" />
          <stop offset="1" stopColor="#241833" />
        </linearGradient>

        <linearGradient id="skinTone" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#F4C7A6" />
          <stop offset=".55" stopColor="#D99B7A" />
          <stop offset="1" stopColor="#A96556" />
        </linearGradient>

        <linearGradient id="hairTone" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#55415E" />
          <stop offset=".5" stopColor="#211829" />
          <stop offset="1" stopColor="#090811" />
        </linearGradient>

        <linearGradient id="racketTone" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#DCC5FF" />
          <stop offset=".45" stopColor="#8D50C8" />
          <stop offset="1" stopColor="#43235F" />
        </linearGradient>

        <radialGradient id="peopleAura">
          <stop stopColor="#A879FF" stopOpacity=".42" />
          <stop offset=".6" stopColor="#7541B8" stopOpacity=".14" />
          <stop offset="1" stopColor="#A879FF" stopOpacity="0" />
        </radialGradient>

        <filter id="peopleBlur">
          <feGaussianBlur stdDeviation="18" />
        </filter>

        <filter id="figureShadow" x="-30%" y="-30%" width="160%" height="180%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
          <feOffset dy="7" />
          <feComponentTransfer>
            <feFuncA type="linear" slope=".25" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Световой фон */}
      <ellipse
        cx="285"
        cy="272"
        rx="245"
        ry="75"
        fill="url(#peopleAura)"
        filter="url(#peopleBlur)"
      />
      <path
        d="M25 292 C105 90 430 28 535 278"
        stroke="#B78BFF"
        strokeOpacity=".28"
        strokeWidth="1.5"
      />
      <path
        d="M45 310 C170 130 400 115 515 300"
        stroke="#B78BFF"
        strokeOpacity=".13"
      />

      {/* Ученик */}
      <g filter="url(#figureShadow)">
        {/* Корпус */}
        <path
          d="M24 340 C32 255 65 205 124 190 C177 177 216 218 237 340Z"
          fill="url(#studentClothes)"
          stroke="#C5A4FF"
          strokeOpacity=".55"
          strokeWidth="2"
        />
        <path
          d="M82 212 C108 190 151 190 179 215 L204 277 L104 295 L57 250Z"
          fill="#D7B8FF"
          fillOpacity=".12"
        />

        {/* Шея и голова */}
        <path
          d="M104 178 L107 211 L143 232"
          stroke="url(#skinTone)"
          strokeWidth="21"
          strokeLinecap="round"
        />
        <path
          d="M76 177 C57 150 59 110 77 80 C96 49 137 45 163 66 C190 89 182 136 162 166 L141 187Z"
          fill="url(#skinTone)"
        />
        <path
          d="M73 123 C54 85 77 41 122 35 C164 29 192 58 183 100 C168 78 147 70 124 77 C102 83 91 105 73 123Z"
          fill="url(#hairTone)"
        />
        <path
          d="M86 105 C101 90 111 72 117 57"
          stroke="#A78AB4"
          strokeOpacity=".35"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M105 132 Q120 139 135 132"
          stroke="#8C514A"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M97 111 Q108 105 119 110"
          stroke="#30212B"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M136 109 Q147 104 157 109"
          stroke="#30212B"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Рука ученика */}
        <path
          d="M151 220 L203 247"
          stroke="url(#skinTone)"
          strokeWidth="17"
          strokeLinecap="round"
        />
        <path
          d="M202 247 L231 226"
          stroke="url(#skinTone)"
          strokeWidth="14"
          strokeLinecap="round"
        />
      </g>

      {/* Ракетка ученика */}
      <g transform="rotate(27 244 210)">
        <rect x="238" y="211" width="12" height="65" rx="5" fill="#A77AE1" />
        <ellipse
          cx="244"
          cy="194"
          rx="22"
          ry="29"
          fill="#26182F"
          stroke="#D0AEFF"
          strokeWidth="3"
        />
        <ellipse cx="244" cy="194" rx="16" ry="22" fill="url(#racketTone)" />
        <path
          d="M233 181 L252 208 M231 193 L248 217"
          stroke="#E5D4FF"
          strokeOpacity=".5"
          strokeWidth="1.5"
        />
      </g>

      {/* Тренер */}
      <g filter="url(#figureShadow)">
        {/* Корпус */}
        <path
          d="M250 340 C265 232 307 177 386 171 C468 166 515 226 537 340Z"
          fill="url(#coachClothes)"
          stroke="#D0B0FF"
          strokeOpacity=".75"
          strokeWidth="2"
        />
        <path
          d="M324 196 C355 175 395 179 422 200 L445 260 L350 284 L298 238Z"
          fill="#E1C9FF"
          fillOpacity=".13"
        />

        {/* Шея */}
        <path
          d="M345 159 L346 191 L311 217"
          stroke="url(#skinTone)"
          strokeWidth="21"
          strokeLinecap="round"
        />

        {/* Голова */}
        <path
          d="M337 158 C312 130 312 91 331 58 C352 25 396 25 423 50 C448 74 439 122 415 154 L390 174Z"
          fill="url(#skinTone)"
        />
        <path
          d="M327 103 C308 59 337 16 385 13 C431 10 458 44 446 95 C427 65 400 57 374 66 C352 72 343 91 327 103Z"
          fill="url(#hairTone)"
        />
        <path
          d="M339 96 C353 82 362 65 369 48"
          stroke="#A78AB4"
          strokeOpacity=".35"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M355 120 Q371 128 387 118"
          stroke="#8C514A"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M349 99 Q360 92 370 98"
          stroke="#30212B"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M390 97 Q402 91 413 97"
          stroke="#30212B"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Рука, указывающая на технику */}
        <path
          d="M346 190 L310 220"
          stroke="url(#skinTone)"
          strokeWidth="19"
          strokeLinecap="round"
        />
        <path
          d="M310 220 L270 203"
          stroke="url(#skinTone)"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path
          d="M270 203 L251 184"
          stroke="url(#skinTone)"
          strokeWidth="13"
          strokeLinecap="round"
        />
        <path
          d="M251 184 L239 169"
          stroke="url(#skinTone)"
          strokeWidth="8"
          strokeLinecap="round"
        />

        {/* Вторая рука с планшетом */}
        <path
          d="M425 175 L450 201 L481 184"
          stroke="url(#skinTone)"
          strokeWidth="19"
          strokeLinecap="round"
        />
        <path
          d="M481 184 L494 174"
          stroke="url(#skinTone)"
          strokeWidth="13"
          strokeLinecap="round"
        />

        {/* Планшет */}
        <g transform="rotate(-9 453 225)">
          <rect
            x="412"
            y="192"
            width="86"
            height="65"
            rx="8"
            fill="#171222"
            stroke="#C8A3FF"
            strokeWidth="2"
          />
          <rect
            x="420"
            y="200"
            width="70"
            height="49"
            rx="4"
            fill="#21182F"
          />
          <path
            d="M431 214 L477 214 M431 225 L468 225 M431 236 L458 236"
            stroke="#B78BFF"
            strokeOpacity=".85"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="482" cy="207" r="2" fill="#E0CCFF" />
        </g>

        {/* Маркировка на форме */}
        <text
          x="392"
          y="253"
          fill="#F0E6FF"
          fillOpacity=".85"
          fontSize="12"
          fontWeight="800"
          letterSpacing="2"
        >
          PL
        </text>
      </g>

      {/* Декоративные световые точки */}
      <circle cx="75" cy="75" r="3" fill="#D8BFFF" />
      <circle cx="486" cy="58" r="4" fill="#B78BFF" />
      <circle cx="506" cy="78" r="2" fill="#FFFFFF" />
    </svg>
  );
}

export default function WhyPongLab() {
  const reduced = useReducedMotion();

  const comparison = [
    ["Большее количество повторений", "yes", "partial"],
    ["Отработка одного элемента", "yes", "yes"],
    ["Тактический разбор", "no", "yes"],
    ["Исправление техники", "no", "yes"],
    ["Самостоятельные тренировки", "yes", "no"],
    ["Гибкий график", "yes", "partial"],
  ] as const;

  return (
    <main className="relative mx-auto w-full max-w-[1320px] overflow-hidden text-white">
      {/* Спокойное фоновое оформление без постоянно движущихся слоёв */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 top-20 h-[430px] w-[430px] rounded-full bg-[#7B42D2]/10 blur-[130px]" />
        <div className="absolute -right-32 top-[35%] h-[450px] w-[450px] rounded-full bg-[#8F5BFF]/10 blur-[150px]" />
        <div className="absolute bottom-0 left-1/3 h-[350px] w-[350px] rounded-full bg-[#6E42B2]/10 blur-[130px]" />
      </div>

      <div className="flex flex-col gap-2 sm:gap-2.5">

        {/* Верхний блок: заголовок, пояснение, робот */}
        <Reveal className="relative overflow-hidden border-b border-white/[0.10] px-3 pb-5 pt-1 sm:px-6 sm:pb-6">
          <div className="relative z-10 mb-4 flex items-center gap-3">
            <span className="text-lg font-black tracking-tight text-white">
              PongLab
            </span>
            <span className="rounded-full border border-[#A879FF]/40 bg-[#8F5BFF]/15 px-3 py-1.5 text-[11px] font-semibold text-[#D9C3FF]">
              Эффективность
            </span>
          </div>

          <div className="grid items-center gap-5 md:grid-cols-[1.05fr_.9fr_1fr] md:gap-4 lg:gap-6">
            {/* Заголовок */}
            <div className="relative z-10 max-w-[620px]">
              <h1 className="text-[clamp(2rem,4vw,3.1rem)] font-black leading-[1.02] tracking-[-.045em]">
                До 10 раз больше
                <span className="block bg-gradient-to-r from-[#C58DFF] to-[#8F55E8] bg-clip-text text-transparent">
                  игровых повторений
                </span>
                за тренировку
              </h1>
            </div>

            {/* Текст теперь находится между заголовком и изображением */}
            <p className="relative z-10 max-w-[390px] border-l border-[#A879FF]/40 py-2 pl-4 text-sm leading-[1.6] text-white/75 sm:text-[15px] md:ml-1 md:pl-5">
              Каждая подача превращается
              <br />
              в возможность отработать технику,
              <br />
              скорость реакции и стабильность
              <br />
              без пауз и ожидания.
            </p>

            {/* Робот: отдельная колонка без наложения на текст */}
            <motion.div
              initial={reduced ? false : { opacity: 0, scale: 0.96 }}
              whileInView={reduced ? undefined : { opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.1, ease: easeSmooth }}
              className="relative mx-auto h-[190px] w-full max-w-[390px] md:h-[220px] lg:h-[245px]"
            >
              <div className="pointer-events-none absolute inset-[12%] rounded-full bg-[#8F5BFF]/20 blur-[55px]" />
              <Image
                src="/why-ponglab/robot-serve.webp"
                alt="Робот PongLab выполняет подачу"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 32vw"
                className="object-contain object-center drop-shadow-[0_0_28px_rgba(143,91,255,.38)]"
              />
            </motion.div>
          </div>
        </Reveal>

        {/* Пункт 1 */}
        <Reveal className="group relative grid gap-4 overflow-hidden border-b border-white/[0.09] px-3 py-3 transition-colors duration-500 hover:bg-white/[0.018] sm:grid-cols-[.95fr_2fr] sm:items-center sm:px-6">
          <div className="flex items-start gap-4">
            <NumberBlock n="1" />
            <div>
              <Heading>
                Больше практики.
                <br />
                Меньше ожидания.
              </Heading>
              <p className="mt-2 text-sm leading-5 text-white/75">
                100% времени посвящено
                <br className="hidden sm:block" />
                тренировке.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <motion.div
              whileHover={reduced ? undefined : { y: -2 }}
              transition={{ duration: 0.45, ease: easeSmooth }}
              className="rounded-2xl border border-[#8F5BFF]/25 bg-gradient-to-br from-[#19152B] to-[#0B0C17] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] transition-shadow duration-500 hover:shadow-[0_8px_25px_rgba(143,91,255,.1)]"
            >
              <div className="flex items-center gap-3">
                <Timer className="text-[#C18CFF]" size={23} />
                <span className="text-sm font-bold">Обычная тренировка</span>
              </div>
              <div className="mt-4 flex gap-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2.5 flex-1 rounded-full ${
                      i < 2
                        ? "bg-gradient-to-r from-[#C18CFF] to-[#8B4BD0]"
                        : "bg-white/15"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-2 text-center text-xs text-white/80">
                ≈ 30–40% активной игры
              </p>
            </motion.div>

            <motion.div
              whileHover={reduced ? undefined : { y: -2 }}
              transition={{ duration: 0.45, ease: easeSmooth }}
              className="rounded-2xl border border-[#B78BFF]/65 bg-gradient-to-br from-[#2B1B46] to-[#151022] p-4 shadow-[0_0_22px_rgba(143,91,255,.13)] transition-shadow duration-500 hover:shadow-[0_8px_28px_rgba(143,91,255,.2)]"
            >
              <div className="flex items-center gap-3">
                <Zap className="text-[#D3B0FF]" size={23} />
                <span className="text-sm font-bold">Тренировка с PongLab</span>
              </div>
              <div className="mt-4 flex gap-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-2.5 flex-1 rounded-full bg-gradient-to-r from-[#C18CFF] to-[#E1C6FF] shadow-[0_0_8px_rgba(183,139,255,.35)]"
                  />
                ))}
              </div>
              <p className="mt-2 text-center text-xs text-white/90">
                ≈ 100% активной игры
              </p>
            </motion.div>
          </div>
        </Reveal>

        {/* Пункт 2 */}
        <Reveal className="group relative grid gap-4 overflow-hidden border-b border-white/[0.09] px-3 py-3 transition-colors duration-500 hover:bg-white/[0.018] sm:grid-cols-[.95fr_2fr] sm:items-center sm:px-6">
          <div className="flex items-start gap-4">
            <NumberBlock n="2" />
            <div>
              <Heading>
                Отрабатывайте именно то,
                <br className="hidden lg:block" />
                что хотите улучшить.
              </Heading>
              <p className="mt-2 max-w-[300px] text-xs leading-[1.35] text-white/70">
                Робот способен повторять один
                <br className="hidden lg:block" />
                и тот же сценарий сотни раз подряд
                <br className="hidden lg:block" />
                с одинаковой точностью.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <SkillCard icon={Target} title="Форхенд" index={0} />
            <SkillCard icon={CircleDot} title="Бэкхенд" index={1} />
            <SkillCard icon={Moon} title="Приём подачи" index={2} />
            <SkillCard icon={Footprints} title="Работа ног" index={3} />
          </div>
        </Reveal>

        {/* Пункт 3 */}
        <Reveal className="group relative grid gap-4 overflow-hidden border-b border-white/[0.09] px-3 py-3 transition-colors duration-500 hover:bg-white/[0.018] sm:grid-cols-[.95fr_2fr] sm:items-center sm:px-6">
          <div className="flex items-start gap-4">
            <NumberBlock n="3" />
            <div>
              <Heading>
                Тренируйтесь тогда,
                <br />
                когда удобно вам.
              </Heading>
              <p className="mt-2 max-w-[310px] text-xs leading-[1.35] text-white/70">
                Не нужно подстраиваться под расписание
                <br className="hidden lg:block" />
                тренера или искать партнёра для игры.
                <br className="hidden lg:block" />
                Вы сами выбираете время тренировки
                <br className="hidden lg:block" />
                и её продолжительность.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <SkillCard icon={Sun} title="Утро" index={0} />
            <SkillCard icon={Sun} title="День" index={1} />
            <SkillCard icon={Moon} title="Вечер" index={2} />
            <SkillCard icon={CalendarDays} title="Выходные" index={3} />
          </div>
        </Reveal>

        {/* Пункт 4 */}
        <Reveal className="relative grid grid-cols-[52px_1fr] items-center gap-3 overflow-hidden border-b border-white/[0.09] px-3 py-4 sm:grid-cols-[70px_1fr_250px] sm:px-6 sm:py-3">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(143,91,255,.11),transparent_65%)]" />

          <div className="relative z-10">
            <NumberBlock n="4" />
          </div>

          <div className="relative z-10 text-center">
            <div className="text-[clamp(3.7rem,9vw,5.8rem)] font-black italic leading-[.9] tracking-[-.065em] text-transparent bg-gradient-to-b from-white via-[#D9B8FF] to-[#9D5BEF] bg-clip-text drop-shadow-[0_0_22px_rgba(168,121,255,.35)]">
              1000+
            </div>
            <div className="mt-2 text-sm font-extrabold uppercase tracking-wide text-white sm:text-lg">
              Ударов за тренировку
            </div>
          </div>

          <p className="relative z-10 col-span-2 mx-auto max-w-[360px] border-t border-[#A879FF]/30 pt-3 text-center text-xs leading-[1.45] text-white/75 sm:col-span-1 sm:mx-0 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0 sm:text-left sm:text-sm">
            Чем больше качественных повторений,
            тем быстрее формируется стабильный
            игровой навык.
          </p>
        </Reveal>

        {/* Пункт 5 */}
        <Reveal className="group relative grid gap-4 overflow-hidden border-b border-white/[0.09] px-3 py-3 transition-colors duration-500 hover:bg-white/[0.018] sm:grid-cols-[.95fr_2fr] sm:items-start sm:px-6">
          <div className="flex items-start gap-4">
            <NumberBlock n="5" />
            <Heading>
              PongLab — это больше,
              <br />
              чем робот.
            </Heading>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <SmallCard
              index={0}
              icon={ChartNoAxesCombined}
              title="Статистика тренировок"
              description="Отслеживайте свою активность и прогресс."
            />
            <SmallCard
              index={1}
              icon={SlidersHorizontal}
              title="Индивидуальные режимы"
              description="Создавайте собственные сценарии подачи."
            />
            <SmallCard
              index={2}
              icon={Trophy}
              title="Классическая партия"
              description="Приводите друзей, соперничайте или пробуйте новое."
            />
            <SmallCard
              index={3}
              icon={Trophy}
              title="Турниры участников"
              description="Соревнуйтесь с другими игроками."
            />
            <SmallCard
              index={4}
              icon={ChartNoAxesCombined}
              title="Аналитика развития"
              description="Видьте результаты своей работы."
            />
          </div>
        </Reveal>

        {/* Пункт 6 */}
        <Reveal className="group relative grid gap-4 overflow-hidden border-b border-white/[0.09] px-3 py-3 sm:grid-cols-[.95fr_2fr] sm:px-6">
          <div className="flex items-start gap-4">
            <NumberBlock n="6" />
            <div>
              <Heading>
                PongLab и тренер
                <br />
                дополняют друг друга.
              </Heading>
              <p className="mt-3 text-sm font-semibold leading-[1.35] text-[#C18CFF]">
                Они не конкурируют,
                <br />
                а усиливают результат.
              </p>
            </div>
          </div>

          <div className="grid items-center gap-3 lg:grid-cols-[1.2fr_.9fr]">
            {/* Сравнительная таблица */}
            <div className="relative overflow-hidden rounded-xl border border-white/15 bg-gradient-to-br from-[#171329] to-[#090B15] p-2 shadow-[0_0_22px_rgba(143,91,255,.07)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_90%,rgba(143,91,255,.13),transparent_65%)]" />

              <div className="relative">
                <div className="grid grid-cols-[1.5fr_.8fr_.8fr] border-b border-white/15 text-[10px] font-bold text-white/90 sm:text-[11px]">
                  <div className="p-2">Задача</div>
                  <div className="border-l border-white/10 p-2 text-center">
                    PongLab
                  </div>
                  <div className="border-l border-white/10 p-2 text-center">
                    Тренер
                  </div>
                </div>

                {comparison.map(([name, pong, coach]) => (
                  <div
                    key={name}
                    className="grid grid-cols-[1.5fr_.8fr_.8fr] border-b border-white/[0.08] text-[10px] last:border-0 sm:text-[11px]"
                  >
                    <div className="flex items-center px-2 py-[5px] text-white/85">
                      {name}
                    </div>
                    <div className="flex items-center justify-center border-l border-white/[0.08] p-1">
                      <ComparisonValue value={pong} />
                    </div>
                    <div className="flex items-center justify-center border-l border-white/[0.08] p-1">
                      <ComparisonValue value={coach} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Новая векторная иллюстрация */}
            <motion.div
              initial={reduced ? false : { opacity: 0, x: 12 }}
              whileInView={reduced ? undefined : { opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.9, ease: easeSmooth }}
              className="relative mx-auto w-full max-w-[390px]"
            >
              <div className="pointer-events-none absolute inset-[12%] rounded-full bg-[#8F5BFF]/20 blur-[48px]" />
              <div className="relative">
                <CoachArtwork />
              </div>
            </motion.div>
          </div>
        </Reveal>

        {/* Нижний призыв */}
        <Reveal className="relative grid gap-4 overflow-hidden rounded-2xl border border-[#A879FF]/50 bg-gradient-to-r from-[#171329] via-[#171329] to-[#201438] px-4 py-5 shadow-[0_0_30px_rgba(143,91,255,.08)] sm:grid-cols-[1.1fr_1.3fr_auto_auto] sm:items-center sm:gap-5 sm:px-6">
          <div className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full bg-[#8F5BFF]/15 blur-[70px]" />

          <h2 className="relative text-lg font-black leading-[1.2] tracking-[-.02em] text-white sm:text-xl">
            Каждая тренировка приближает
            <br className="hidden sm:block" />
            вас к следующему уровню.
          </h2>

          <p className="relative text-[11px] leading-[1.5] text-white/70 sm:border-l sm:border-white/15 sm:pl-5">
            Тренируйтесь тогда, когда удобно. Работайте над тем, что
            действительно важно. Получайте больше качественной практики
            за каждую минуту у стола.
          </p>

          <Link
            href="/pricing"
            className="group relative inline-flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#8747DB] to-[#A66AFF] px-6 py-3.5 text-sm font-extrabold text-white shadow-[0_6px_25px_rgba(143,91,255,.3)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_10px_35px_rgba(143,91,255,.45)]"
          >
            <span className="pointer-events-none absolute inset-0 rounded-xl bg-white/0 transition-colors duration-500 group-hover:bg-white/[0.09]" />
            <span className="relative">Выбрать тариф</span>
            <span className="relative text-lg transition-transform duration-500 group-hover:translate-x-1">
              →
            </span>
          </Link>

          <div className="relative text-center text-xs leading-[1.4] text-white/75 sm:border-l sm:border-white/15 sm:pl-5">
            От 499 ₽
            <br />
            за тренировку
          </div>
        </Reveal>
      </div>
    </main>
  );
}
