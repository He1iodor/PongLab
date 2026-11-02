
"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
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
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const easeOut = [0.22, 1, 0.36, 1] as const;

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
      initial={reduced ? false : { opacity: 0, y: 25, filter: "blur(5px)" }}
      whileInView={
        reduced
          ? undefined
          : { opacity: 1, y: 0, filter: "blur(0px)" }
      }
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.95, delay, ease: easeOut }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function NumberBlock({ n }: { n: string }) {
  return (
    <motion.div
      initial={{ opacity: 0.5, scale: 0.92 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.9, ease: easeOut }}
      className="w-[52px] shrink-0 text-[54px] font-black leading-[.9] tracking-[-.07em] text-[#B78BFF] drop-shadow-[0_0_17px_rgba(168,121,255,.55)] sm:w-[62px] sm:text-[64px]"
    >
      {n}
    </motion.div>
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
      initial={reduced ? false : { opacity: 0, y: 15 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7, delay: index * 0.07, ease: easeOut }}
      whileHover={reduced ? undefined : { y: -5, scale: 1.015 }}
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/[0.10] bg-gradient-to-br from-[#1A162A]/95 via-[#11101D]/95 to-[#0B0C16]/95 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.045)] transition-[border-color,box-shadow] duration-700 hover:border-[#B78BFF]/55 hover:shadow-[0_10px_30px_rgba(143,91,255,.13)] sm:p-3.5"
    >
      <div className="pointer-events-none absolute -right-8 -top-10 h-20 w-20 rounded-full bg-[#A879FF]/0 blur-2xl transition-all duration-700 group-hover:bg-[#A879FF]/25" />
      <Icon
        size={24}
        strokeWidth={1.9}
        className="relative mb-2 text-[#C18CFF] drop-shadow-[0_0_9px_rgba(183,139,255,.65)] transition-transform duration-700 group-hover:scale-110"
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
      initial={reduced ? false : { opacity: 0, y: 14 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.75, delay: index * 0.08, ease: easeOut }}
      whileHover={reduced ? undefined : { y: -5, scale: 1.02 }}
      className="group relative flex min-h-[82px] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/[0.10] bg-gradient-to-br from-[#19152B] to-[#0C0D18] px-2 py-3 transition-all duration-700 hover:border-[#B78BFF]/60 hover:shadow-[0_0_25px_rgba(143,91,255,.15)] sm:min-h-[86px]"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#A879FF]/0 to-[#A879FF]/0 transition-all duration-700 group-hover:from-[#A879FF]/10 group-hover:to-transparent" />
      <Icon
        size={27}
        strokeWidth={1.8}
        className="relative text-[#C18CFF] drop-shadow-[0_0_9px_rgba(183,139,255,.7)] transition-all duration-700 group-hover:scale-110 group-hover:drop-shadow-[0_0_15px_rgba(183,139,255,.9)]"
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
        className="mx-auto text-[#C18CFF] drop-shadow-[0_0_7px_rgba(183,139,255,.6)]"
      />
    );
  }

  if (value === "partial") {
    return <span className="text-[10px] text-white/75 sm:text-[11px]">Частично</span>;
  }

  return <span className="text-white/55">—</span>;
}

/* Детальная векторная сцена: тренер объясняет игроку технику */
function CoachArtwork() {
  return (
    <svg
      viewBox="0 0 560 330"
      className="h-full w-full overflow-visible"
      role="img"
      aria-label="Тренер объясняет игроку технику игры"
      fill="none"
    >
      <defs>
        <linearGradient id="coachShirt" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#D6B6FF" />
          <stop offset=".42" stopColor="#9255D6" />
          <stop offset="1" stopColor="#39205F" />
        </linearGradient>

        <linearGradient id="playerShirt" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#B58AF4" />
          <stop offset=".55" stopColor="#68409B" />
          <stop offset="1" stopColor="#281B43" />
        </linearGradient>

        <linearGradient id="skin" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#F2C3A0" />
          <stop offset=".55" stopColor="#D99B7A" />
          <stop offset="1" stopColor="#A96556" />
        </linearGradient>

        <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#40334C" />
          <stop offset=".5" stopColor="#171321" />
          <stop offset="1" stopColor="#080811" />
        </linearGradient>

        <linearGradient id="tablet" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#302342" />
          <stop offset="1" stopColor="#10101B" />
        </linearGradient>

        <radialGradient id="coachAura">
          <stop stopColor="#A879FF" stopOpacity=".48" />
          <stop offset=".55" stopColor="#7541B8" stopOpacity=".16" />
          <stop offset="1" stopColor="#A879FF" stopOpacity="0" />
        </radialGradient>

        <filter id="coachBlur">
          <feGaussianBlur stdDeviation="18" />
        </filter>

        <filter id="coachShadow" x="-30%" y="-30%" width="160%" height="180%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="7" />
          <feOffset dy="8" />
          <feComponentTransfer>
            <feFuncA type="linear" slope=".28" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Свет и глубина */}
      <ellipse cx="284" cy="264" rx="250" ry="80" fill="url(#coachAura)" filter="url(#coachBlur)" />
      <path d="M25 285 C90 80 430 20 535 270" stroke="#B78BFF" strokeOpacity=".35" strokeWidth="1.5" />
      <path d="M45 302 C170 120 395 105 510 295" stroke="#B78BFF" strokeOpacity=".16" />
      <circle cx="76" cy="83" r="3" fill="#D8BFFF" />
      <circle cx="482" cy="65" r="4" fill="#B78BFF" />
      <circle cx="503" cy="83" r="2" fill="#FFFFFF" />

      {/* Игрок: плечи и корпус */}
      <g filter="url(#coachShadow)">
        <path
          d="M28 330 C38 245 66 190 126 180 C174 171 213 207 233 330Z"
          fill="url(#playerShirt)"
          stroke="#C5A4FF"
          strokeOpacity=".55"
          strokeWidth="2"
        />
        <path
          d="M77 205 C94 188 120 181 143 183 L163 218 L118 254 L68 238Z"
          fill="#B58AF4"
          fillOpacity=".28"
        />
        <path d="M116 177 L116 205 L151 228" stroke="url(#skin)" strokeWidth="21" strokeLinecap="round" />
        <path d="M151 228 L210 249" stroke="url(#skin)" strokeWidth="17" strokeLinecap="round" />
        <path d="M202 246 L231 226" stroke="url(#skin)" strokeWidth="15" strokeLinecap="round" />
        <path
          d="M92 176 C71 151 67 114 83 82 C99 50 138 43 165 63 C193 84 187 132 166 165 L143 188Z"
          fill="url(#skin)"
        />
        <path
          d="M79 121 C58 83 81 38 126 33 C166 28 194 55 186 98 C174 78 150 70 128 76 C105 82 96 104 79 121Z"
          fill="url(#hair)"
        />
        <path d="M88 117 C101 107 110 93 119 82" stroke="#6A536F" strokeOpacity=".5" strokeWidth="5" strokeLinecap="round" />
        <path d="M116 133 Q131 140 145 132" stroke="#8C514A" strokeWidth="2" strokeLinecap="round" />
        <path d="M107 112 Q117 106 127 111" stroke="#30212B" strokeWidth="3" strokeLinecap="round" />
        <path d="M145 110 Q155 105 165 110" stroke="#30212B" strokeWidth="3" strokeLinecap="round" />
        <path d="M143 157 L151 170" stroke="#A96556" strokeWidth="3" strokeLinecap="round" />
      </g>

      {/* Ракетка игрока */}
      <g transform="rotate(28 244 212)">
        <rect x="234" y="210" width="12" height="58" rx="5" fill="#B98AF2" />
        <ellipse cx="240" cy="195" rx="21" ry="29" fill="#25152F" stroke="#D0AEFF" strokeWidth="3" />
        <ellipse cx="240" cy="195" rx="15" ry="22" fill="#6D3BA5" />
        <path d="M231 182 L249 207 M229 192 L246 215" stroke="#D9BFFF" strokeOpacity=".45" />
      </g>

      {/* Тренер: корпус */}
      <g filter="url(#coachShadow)">
        <path
          d="M250 330 C264 221 305 168 385 164 C468 160 515 218 535 330Z"
          fill="url(#coachShirt)"
          stroke="#D0B0FF"
          strokeOpacity=".75"
          strokeWidth="2"
        />
        <path
          d="M323 185 C354 170 391 171 420 190 L444 244 L354 272 L298 226Z"
          fill="#D8B8FF"
          fillOpacity=".16"
        />
        <path d="M343 162 L343 190 L307 216" stroke="url(#skin)" strokeWidth="21" strokeLinecap="round" />
        <path d="M307 216 L268 199" stroke="url(#skin)" strokeWidth="17" strokeLinecap="round" />
        <path d="M268 199 L246 179" stroke="url(#skin)" strokeWidth="14" strokeLinecap="round" />
        <path d="M424 164 L449 194 L478 177" stroke="url(#skin)" strokeWidth="19" strokeLinecap="round" />
        <path d="M478 177 L491 169" stroke="url(#skin)" strokeWidth="13" strokeLinecap="round" />

        {/* Голова тренера */}
        <path
          d="M336 158 C311 130 311 91 330 58 C351 25 395 25 422 50 C447 74 438 122 414 154 L389 174Z"
          fill="url(#skin)"
        />
        <path
          d="M326 102 C307 59 336 16 384 13 C430 10 457 44 445 94 C426 65 399 57 373 66 C351 72 342 90 326 102Z"
          fill="url(#hair)"
        />
        <path d="M336 97 C351 83 360 66 367 48" stroke="#78627D" strokeOpacity=".48" strokeWidth="5" strokeLinecap="round" />
        <path d="M354 120 Q370 128 386 118" stroke="#8C514A" strokeWidth="2" strokeLinecap="round" />
        <path d="M348 99 Q359 92 369 98" stroke="#30212B" strokeWidth="3" strokeLinecap="round" />
        <path d="M389 97 Q401 91 412 97" stroke="#30212B" strokeWidth="3" strokeLinecap="round" />
        <path d="M380 143 L385 155" stroke="#A96556" strokeWidth="3" strokeLinecap="round" />

        {/* Планшет */}
        <g transform="rotate(-9 453 218)">
          <rect x="414" y="190" width="82" height="61" rx="8" fill="url(#tablet)" stroke="#C8A3FF" strokeWidth="2" />
          <rect x="421" y="197" width="68" height="46" rx="4" fill="#171323" />
          <path d="M431 211 L476 211 M431 220 L467 220 M431 229 L457 229" stroke="#B78BFF" strokeOpacity=".8" strokeWidth="2" strokeLinecap="round" />
          <circle cx="481" cy="205" r="2" fill="#E0CCFF" />
        </g>

        {/* Логотип на форме */}
        <text
          x="393"
          y="247"
          fill="#F0E6FF"
          fillOpacity=".8"
          fontSize="12"
          fontWeight="800"
          letterSpacing="2"
        >
          PL
        </text>
      </g>
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
      {/* Атмосферное фоновое свечение */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          animate={reduced ? undefined : { x: [0, 35, 0], y: [0, -20, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -left-40 top-20 h-[430px] w-[430px] rounded-full bg-[#7B42D2]/10 blur-[130px]"
        />
        <motion.div
          animate={reduced ? undefined : { x: [0, -30, 0], y: [0, 25, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -right-32 top-[35%] h-[450px] w-[450px] rounded-full bg-[#8F5BFF]/10 blur-[150px]"
        />
        <div className="absolute bottom-0 left-1/3 h-[350px] w-[350px] rounded-full bg-[#6E42B2]/10 blur-[130px]" />
      </div>

      <div className="flex flex-col gap-2 sm:gap-2.5">

        {/* Шапка и заголовок */}
        <Reveal className="relative overflow-hidden border-b border-white/[0.10] px-3 pb-5 pt-1 sm:px-6 sm:pb-6">
          <div className="relative z-20 mb-4 flex items-center gap-3">
            <span className="text-lg font-black tracking-tight text-white">
              PongLab
            </span>
            <span className="rounded-full border border-[#A879FF]/40 bg-[#8F5BFF]/15 px-3 py-1.5 text-[11px] font-semibold text-[#D9C3FF]">
              Эффективность
            </span>
          </div>

          <div className="relative grid gap-4 md:grid-cols-[1.1fr_.9fr] md:items-center">
            <div className="relative z-20 max-w-[620px]">
              <h1 className="text-[clamp(2rem,4vw,3.1rem)] font-black leading-[1.02] tracking-[-.045em]">
                До 10 раз больше
                <span className="block bg-gradient-to-r from-[#C58DFF] to-[#8F55E8] bg-clip-text text-transparent">
                  игровых повторений
                </span>
                за тренировку
              </h1>
            </div>

            <p className="relative z-20 max-w-[390px] border-l border-[#A879FF]/40 pl-5 text-sm leading-[1.55] text-white/75 sm:text-[15px] md:ml-2">
              Каждая подача превращается
              <br className="hidden sm:block" />
              в возможность отработать технику,
              <br className="hidden sm:block" />
              скорость реакции и стабильность
              <br className="hidden sm:block" />
              без пауз и ожидания.
            </p>

            {/* Робот интегрирован в фон: нет прямоугольной рамки */}
            <motion.div
              animate={reduced ? undefined : { y: [0, -7, 0], rotate: [0, 0.5, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none absolute -right-8 -top-20 hidden h-[340px] w-[55%] md:block lg:-right-3 lg:h-[370px]"
            >
              <div className="absolute inset-0 rounded-full bg-[#8F5BFF]/20 blur-[75px]" />
              <Image
                src="/why-ponglab/robot-serve.webp"
                alt="Робот PongLab выполняет подачу"
                fill
                priority
                sizes="55vw"
                className="object-contain object-center [mask-image:radial-gradient(ellipse_at_52%_50%,black_38%,rgba(0,0,0,.8)_58%,transparent_78%)] mix-blend-screen drop-shadow-[0_0_35px_rgba(143,91,255,.4)]"
              />
            </motion.div>
          </div>

          <div className="relative mt-3 h-[185px] w-full md:hidden">
            <div className="absolute inset-0 rounded-full bg-[#8F5BFF]/20 blur-[60px]" />
            <Image
              src="/why-ponglab/robot-serve.webp"
              alt="Робот PongLab выполняет подачу"
              fill
              sizes="100vw"
              className="object-contain object-center [mask-image:radial-gradient(ellipse_at_50%_50%,black_45%,transparent_82%)] mix-blend-screen"
            />
          </div>
        </Reveal>

        {/* Пункт 1 */}
        <Reveal className="group relative grid gap-4 overflow-hidden border-b border-white/[0.09] px-3 py-3 transition-colors duration-700 hover:bg-white/[0.018] sm:grid-cols-[.95fr_2fr] sm:items-center sm:px-6">
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
              whileHover={{ y: -3 }}
              transition={{ duration: 0.5 }}
              className="rounded-2xl border border-[#8F5BFF]/25 bg-gradient-to-br from-[#19152B] to-[#0B0C17] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.04)]"
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
              whileHover={{ y: -3 }}
              transition={{ duration: 0.5 }}
              className="rounded-2xl border border-[#B78BFF]/80 bg-gradient-to-br from-[#2B1B46] to-[#151022] p-4 shadow-[0_0_25px_rgba(143,91,255,.18)]"
            >
              <div className="flex items-center gap-3">
                <Zap className="text-[#D3B0FF]" size={23} />
                <span className="text-sm font-bold">Тренировка с PongLab</span>
              </div>
              <div className="mt-4 flex gap-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <motion.div
                    key={i}
                    initial={reduced ? false : { opacity: 0.2 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.09, duration: 0.8 }}
                    className="h-2.5 flex-1 rounded-full bg-gradient-to-r from-[#C18CFF] to-[#E1C6FF] shadow-[0_0_10px_rgba(183,139,255,.4)]"
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
        <Reveal className="group relative grid gap-4 overflow-hidden border-b border-white/[0.09] px-3 py-3 transition-colors duration-700 hover:bg-white/[0.018] sm:grid-cols-[.95fr_2fr] sm:items-center sm:px-6">
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
        <Reveal className="group relative grid gap-4 overflow-hidden border-b border-white/[0.09] px-3 py-3 transition-colors duration-700 hover:bg-white/[0.018] sm:grid-cols-[.95fr_2fr] sm:items-center sm:px-6">
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
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(143,91,255,.12),transparent_65%)]" />
          <div className="relative z-10">
            <NumberBlock n="4" />
          </div>

          <div className="relative z-10 text-center">
            <motion.div
              animate={reduced ? undefined : { textShadow: [
                "0 0 18px rgba(168,121,255,.35)",
                "0 0 38px rgba(168,121,255,.75)",
                "0 0 18px rgba(168,121,255,.35)",
              ] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="text-[clamp(3.7rem,9vw,5.8rem)] font-black italic leading-[.9] tracking-[-.065em] text-transparent bg-gradient-to-b from-white via-[#D9B8FF] to-[#9D5BEF] bg-clip-text"
            >
              1000+
            </motion.div>
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
        <Reveal className="group relative grid gap-4 overflow-hidden border-b border-white/[0.09] px-3 py-3 transition-colors duration-700 hover:bg-white/[0.018] sm:grid-cols-[.95fr_2fr] sm:items-start sm:px-6">
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
            <div className="relative overflow-hidden rounded-xl border border-white/15 bg-gradient-to-br from-[#171329] to-[#090B15] p-2 shadow-[0_0_25px_rgba(143,91,255,.08)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_90%,rgba(143,91,255,.2),transparent_65%)]" />
              <div className="relative">
                <div className="grid grid-cols-[1.5fr_.8fr_.8fr] border-b border-white/15 text-[10px] font-bold text-white/90 sm:text-[11px]">
                  <div className="p-2">Задача</div>
                  <div className="border-l border-white/10 p-2 text-center">PongLab</div>
                  <div className="border-l border-white/10 p-2 text-center">Тренер</div>
                </div>

                {comparison.map(([name, pong, coach]) => (
                  <div
                    key={name}
                    className="grid grid-cols-[1.5fr_.8fr_.8fr] border-b border-white/[0.08] last:border-0 text-[10px] sm:text-[11px]"
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

            <motion.div
              initial={reduced ? false : { opacity: 0, x: 22, scale: 0.97 }}
              whileInView={reduced ? undefined : { opacity: 1, x: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.1, ease: easeOut }}
              className="relative mx-auto w-full max-w-[380px]"
            >
              <div className="pointer-events-none absolute inset-[12%] rounded-full bg-[#8F5BFF]/25 blur-[55px]" />
              <motion.div
                animate={reduced ? undefined : { y: [0, -4, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
                className="relative"
              >
                <CoachArtwork />
              </motion.div>
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
            className="group relative inline-flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#8747DB] to-[#A66AFF] px-6 py-3.5 text-sm font-extrabold text-white shadow-[0_6px_25px_rgba(143,91,255,.3)] transition-all duration-700 hover:-translate-y-1 hover:shadow-[0_10px_35px_rgba(143,91,255,.5)]"
          >
            <span className="pointer-events-none absolute inset-0 rounded-xl bg-white/0 transition-colors duration-700 group-hover:bg-white/[0.09]" />
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
