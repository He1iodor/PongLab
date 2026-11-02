
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
      aria-label="Тренер объясняет ученику правильное положение ракетки для настольного тенниса"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="coach-jacket" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#CBA8FF" />
          <stop offset=".45" stopColor="#7143A9" />
          <stop offset="1" stopColor="#21162F" />
        </linearGradient>

        <linearGradient id="student-jacket" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#A987E8" />
          <stop offset=".48" stopColor="#513477" />
          <stop offset="1" stopColor="#171322" />
        </linearGradient>

        <linearGradient id="skin" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#F3C5A5" />
          <stop offset=".55" stopColor="#D99A78" />
          <stop offset="1" stopColor="#995D50" />
        </linearGradient>

        <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#59465D" />
          <stop offset=".5" stopColor="#211A29" />
          <stop offset="1" stopColor="#090811" />
        </linearGradient>

        <linearGradient id="racket" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#D9B9FF" />
          <stop offset=".5" stopColor="#9859D7" />
          <stop offset="1" stopColor="#42245F" />
        </linearGradient>

        <radialGradient id="scene-light">
          <stop stopColor="#A879FF" stopOpacity=".38" />
          <stop offset=".65" stopColor="#7541B8" stopOpacity=".12" />
          <stop offset="1" stopColor="#7541B8" stopOpacity="0" />
        </radialGradient>

        <filter id="scene-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="20" />
        </filter>

        <filter id="figure-shadow" x="-30%" y="-30%" width="160%" height="180%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="5" />
          <feOffset dy="6" />
          <feComponentTransfer>
            <feFuncA type="linear" slope=".28" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Фоновое освещение */}
      <ellipse
        cx="285"
        cy="275"
        rx="245"
        ry="75"
        fill="url(#scene-light)"
        filter="url(#scene-blur)"
      />

      <path
        d="M35 286 C120 105 405 55 530 275"
        stroke="#B78BFF"
        strokeOpacity=".22"
        strokeWidth="1.5"
      />

      <path
        d="M65 300 C180 160 390 125 500 295"
        stroke="#B78BFF"
        strokeOpacity=".12"
      />

      {/* Ученик */}
      <g filter="url(#figure-shadow)">
        {/* Корпус */}
        <path
          d="M25 340 C34 268 58 217 112 198 C151 184 194 205 220 246 L245 340Z"
          fill="url(#student-jacket)"
          stroke="#C4A1FF"
          strokeOpacity=".55"
          strokeWidth="2"
        />

        <path
          d="M75 224 C108 200 151 204 180 226 L205 290 L105 310 L55 264Z"
          fill="#D5B8FF"
          fillOpacity=".12"
        />

        {/* Шея */}
        <path
          d="M107 170 L110 205"
          stroke="url(#skin)"
          strokeWidth="25"
          strokeLinecap="round"
        />

        {/* Голова */}
        <path
          d="M77 143 C65 119 68 80 88 59 C107 38 145 40 165 61 C184 83 179 122 161 153 L139 174 L105 166Z"
          fill="url(#skin)"
        />

        {/* Волосы */}
        <path
          d="M72 112 C61 74 86 35 124 31 C161 26 188 53 180 93 C168 73 148 66 127 70 C105 74 91 98 72 112Z"
          fill="url(#hair)"
        />

        <path
          d="M84 91 C100 76 111 58 116 43"
          stroke="#B99BC8"
          strokeOpacity=".28"
          strokeWidth="5"
          strokeLinecap="round"
        />

        {/* Лицо */}
        <path
          d="M91 111 Q103 104 114 110"
          stroke="#34212D"
          strokeWidth="3"
          strokeLinecap="round"
        />

        <path
          d="M139 109 Q151 103 161 109"
          stroke="#34212D"
          strokeWidth="3"
          strokeLinecap="round"
        />

        <path
          d="M116 137 Q130 145 145 136"
          stroke="#965D55"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Рука ученика, держащая ракетку */}
        <path
          d="M154 225 L208 250 L238 226"
          stroke="url(#skin)"
          strokeWidth="18"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M235 225 L248 215"
          stroke="url(#skin)"
          strokeWidth="13"
          strokeLinecap="round"
        />
      </g>

      {/* Ракетка ученика */}
      <g transform="rotate(27 258 190)">
        <rect
          x="253"
          y="192"
          width="12"
          height="72"
          rx="5"
          fill="#9A6ACD"
          stroke="#D9B9FF"
          strokeOpacity=".45"
        />

        <ellipse
          cx="259"
          cy="177"
          rx="23"
          ry="31"
          fill="#26172F"
          stroke="#D9B9FF"
          strokeWidth="2.5"
        />

        <ellipse
          cx="259"
          cy="177"
          rx="17"
          ry="24"
          fill="url(#racket)"
        />

        <path
          d="M248 160 L269 192 M245 174 L265 201"
          stroke="#E5D4FF"
          strokeOpacity=".48"
          strokeWidth="1.5"
        />
      </g>

      {/* Тренер */}
      <g filter="url(#figure-shadow)">
        {/* Корпус */}
        <path
          d="M278 340 C290 254 317 206 369 188 C420 170 469 199 497 245 L535 340Z"
          fill="url(#coach-jacket)"
          stroke="#D1B2FF"
          strokeOpacity=".65"
          strokeWidth="2"
        />

        <path
          d="M325 220 C358 190 410 187 441 211 L466 277 L365 306 L305 265Z"
          fill="#E5D1FF"
          fillOpacity=".12"
        />

        {/* Шея */}
        <path
          d="M368 158 L370 194"
          stroke="url(#skin)"
          strokeWidth="25"
          strokeLinecap="round"
        />

        {/* Голова */}
        <path
          d="M336 139 C322 113 324 75 345 51 C367 26 405 29 427 51 C448 74 442 118 421 150 L398 168 L361 164Z"
          fill="url(#skin)"
        />

        {/* Волосы */}
        <path
          d="M328 108 C314 66 340 27 380 21 C419 15 450 43 443 86 C427 63 405 56 384 61 C360 65 346 91 328 108Z"
          fill="url(#hair)"
        />

        <path
          d="M343 83 C358 68 369 48 373 34"
          stroke="#B99BC8"
          strokeOpacity=".28"
          strokeWidth="5"
          strokeLinecap="round"
        />

        {/* Лицо */}
        <path
          d="M354 108 Q366 101 378 107"
          stroke="#34212D"
          strokeWidth="3"
          strokeLinecap="round"
        />

        <path
          d="M399 107 Q411 101 422 107"
          stroke="#34212D"
          strokeWidth="3"
          strokeLinecap="round"
        />

        <path
          d="M378 137 Q393 145 408 136"
          stroke="#965D55"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Рука тренера: объясняет положение ракетки */}
        <path
          d="M354 199 L321 223 L294 211"
          stroke="url(#skin)"
          strokeWidth="19"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M294 211 L279 202"
          stroke="url(#skin)"
          strokeWidth="13"
          strokeLinecap="round"
        />

        <path
          d="M279 202 L266 191"
          stroke="url(#skin)"
          strokeWidth="9"
          strokeLinecap="round"
        />

        {/* Вторая рука */}
        <path
          d="M432 198 L457 221 L479 205"
          stroke="url(#skin)"
          strokeWidth="19"
          strokeLinecap="round"
        />

        {/* Планшет */}
        <g transform="rotate(-8 475 237)">
          <rect
            x="440"
            y="207"
            width="75"
            height="57"
            rx="8"
            fill="#15101F"
            stroke="#C8A3FF"
            strokeWidth="2"
          />

          <rect
            x="447"
            y="214"
            width="61"
            height="43"
            rx="4"
            fill="#251A34"
          />

          <path
            d="M456 227 L498 227 M456 237 L491 237 M456 247 L481 247"
            stroke="#B78BFF"
            strokeWidth="2"
            strokeLinecap="round"
            strokeOpacity=".85"
          />

          <circle cx="501" cy="220" r="2" fill="#E0CCFF" />
        </g>

        {/* Логотип на форме */}
        <text
          x="391"
          y="271"
          fill="#F0E6FF"
          fillOpacity=".85"
          fontSize="12"
          fontWeight="800"
          letterSpacing="2"
        >
          PL
        </text>
      </g>

      {/* Мягкие декоративные блики */}
      <circle cx="65" cy="72" r="3" fill="#D8BFFF" />
      <circle cx="482" cy="58" r="4" fill="#B78BFF" />
      <circle cx="505" cy="80" r="2" fill="#FFFFFF" />
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
