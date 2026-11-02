
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
      initial={reduced ? false : { opacity: 0, y: 22 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.7, delay, ease: easeOut }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function NumberBlock({ n }: { n: string }) {
  return (
    <div className="w-[52px] shrink-0 text-[54px] font-black leading-[.9] tracking-[-.07em] text-[#B78BFF] drop-shadow-[0_0_17px_rgba(168,121,255,.55)] sm:w-[62px] sm:text-[64px]">
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
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -3, borderColor: "rgba(183,139,255,.65)" }}
      transition={{ duration: 0.4, ease: easeOut }}
      className="flex min-w-0 flex-col rounded-xl border border-[#8F5BFF]/25 bg-gradient-to-br from-[#19152B] to-[#0C0D18] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.035)] transition-shadow duration-500 hover:shadow-[0_0_24px_rgba(143,91,255,.13)] sm:p-3.5"
    >
      <Icon
        size={24}
        strokeWidth={2}
        className="mb-2 text-[#C18CFF] drop-shadow-[0_0_9px_rgba(183,139,255,.65)]"
      />
      <div className="text-[11px] font-bold leading-[1.2] text-white sm:text-xs">
        {title}
      </div>
      {description && (
        <p className="mt-2 text-[10px] leading-[1.35] text-white/65 sm:text-[11px]">
          {description}
        </p>
      )}
    </motion.div>
  );
}

function SkillCard({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.4, ease: easeOut }}
      className="flex min-h-[82px] flex-col items-center justify-center gap-2 rounded-xl border border-[#8F5BFF]/25 bg-gradient-to-br from-[#19152B] to-[#0C0D18] px-2 py-3 transition-all duration-500 hover:border-[#B78BFF]/60 hover:shadow-[0_0_22px_rgba(143,91,255,.12)] sm:min-h-[86px]"
    >
      <Icon
        size={27}
        strokeWidth={2}
        className="text-[#C18CFF] drop-shadow-[0_0_9px_rgba(183,139,255,.7)]"
      />
      <span className="text-center text-[11px] font-bold leading-tight text-white sm:text-xs">
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
    return <Check size={16} strokeWidth={3.2} className="mx-auto text-[#C18CFF]" />;
  }

  if (value === "partial") {
    return <span className="text-[10px] text-white/75 sm:text-[11px]">Частично</span>;
  }

  return <span className="text-white/55">—</span>;
}

function CoachArtwork() {
  return (
    <svg
      viewBox="0 0 460 250"
      className="h-full w-full"
      role="img"
      aria-label="Тренер объясняет игроку технику игры"
      fill="none"
    >
      <defs>
        <linearGradient id="coachShirt" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#C59AFF" />
          <stop offset="1" stopColor="#542A91" />
        </linearGradient>
        <linearGradient id="playerShirt" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#A875E8" />
          <stop offset="1" stopColor="#34204E" />
        </linearGradient>
        <radialGradient id="peopleGlow">
          <stop stopColor="#A879FF" stopOpacity=".45" />
          <stop offset="1" stopColor="#A879FF" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="230" cy="220" rx="215" ry="65" fill="url(#peopleGlow)" />
      <path d="M20 230 Q225 -30 440 220" stroke="#A879FF" strokeOpacity=".5" />
      <path d="M48 239 Q220 30 416 235" stroke="#A879FF" strokeOpacity=".2" />

      {/* Игрок */}
      <path
        d="M22 250 Q32 160 100 150 Q160 143 192 250Z"
        fill="url(#playerShirt)"
        stroke="#B78BFF"
        strokeOpacity=".7"
      />
      <path
        d="M72 142 Q53 104 72 72 Q90 43 121 57 Q153 74 143 116 L127 153Z"
        fill="#D9A17F"
      />
      <path
        d="M66 100 Q48 49 100 35 Q155 24 163 83 Q139 61 115 69 Q88 72 66 100Z"
        fill="#171321"
      />
      <path d="M89 111 Q105 117 119 110" stroke="#754B4C" strokeWidth="2" />
      <path d="M126 151 L148 178 L197 196" stroke="#D9A17F" strokeWidth="13" strokeLinecap="round" />
      <path d="M185 193 L211 178" stroke="#D9A17F" strokeWidth="11" strokeLinecap="round" />
      <ellipse
        cx="216"
        cy="172"
        rx="17"
        ry="24"
        transform="rotate(32 216 172)"
        fill="#281A3C"
        stroke="#C49BFF"
        strokeWidth="3"
      />

      {/* Тренер */}
      <path
        d="M210 250 Q223 148 305 143 Q391 142 430 250Z"
        fill="url(#coachShirt)"
        stroke="#C6A3FF"
        strokeOpacity=".7"
      />
      <path
        d="M275 138 Q253 103 268 68 Q282 34 320 39 Q361 46 359 91 L343 147Z"
        fill="#DCA481"
      />
      <path
        d="M265 88 Q249 38 303 21 Q355 11 379 66 Q347 48 319 55 Q289 58 265 88Z"
        fill="#21182D"
      />
      <path d="M288 111 Q306 119 326 109" stroke="#79504B" strokeWidth="2" />
      <path d="M300 143 L282 171 L250 181" stroke="#DCA481" strokeWidth="13" strokeLinecap="round" />
      <path d="M250 181 L232 164" stroke="#DCA481" strokeWidth="11" strokeLinecap="round" />
      <path d="M341 143 L364 168 L391 155" stroke="#DCA481" strokeWidth="13" strokeLinecap="round" />

      {/* Планшет */}
      <rect
        x="343"
        y="174"
        width="67"
        height="44"
        rx="6"
        transform="rotate(-12 343 174)"
        fill="#171222"
        stroke="#C18CFF"
        strokeWidth="2"
      />
      <path d="M357 190 L392 183 M359 199 L383 194" stroke="#B78BFF" strokeWidth="2" />

      <circle cx="47" cy="52" r="3" fill="#CBAAFF" />
      <circle cx="416" cy="49" r="4" fill="#C18CFF" />
      <circle cx="430" cy="65" r="2" fill="#FFFFFF" />
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
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 top-20 h-[430px] w-[430px] rounded-full bg-[#7B42D2]/10 blur-[130px]" />
        <div className="absolute -right-32 top-[35%] h-[450px] w-[450px] rounded-full bg-[#8F5BFF]/10 blur-[150px]" />
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

            <motion.div
              animate={reduced ? undefined : { y: [0, -6, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none absolute -right-3 -top-16 hidden h-[260px] w-[48%] md:block lg:h-[300px]"
            >
              <Image
                src="/why-ponglab/robot-serve.webp"
                alt="Робот PongLab выполняет подачу"
                fill
                priority
                sizes="48vw"
                className="object-contain object-center drop-shadow-[0_0_35px_rgba(143,91,255,.5)]"
              />
            </motion.div>
          </div>

          <div className="relative mt-3 h-[175px] w-full md:hidden">
            <Image
              src="/why-ponglab/robot-serve.webp"
              alt="Робот PongLab выполняет подачу"
              fill
              sizes="100vw"
              className="object-contain object-center"
            />
          </div>
        </Reveal>

        {/* Пункт 1 */}
        <Reveal className="grid gap-4 border-b border-white/[0.09] px-3 py-3 sm:grid-cols-[.95fr_2fr] sm:items-center sm:px-6">
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
            <div className="rounded-2xl border border-[#8F5BFF]/25 bg-gradient-to-br from-[#19152B] to-[#0B0C17] p-4">
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
            </div>

            <div className="rounded-2xl border border-[#B78BFF]/80 bg-gradient-to-br from-[#2B1B46] to-[#151022] p-4 shadow-[0_0_25px_rgba(143,91,255,.18)]">
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
                    transition={{ delay: i * 0.07, duration: 0.5 }}
                    className="h-2.5 flex-1 rounded-full bg-gradient-to-r from-[#C18CFF] to-[#E1C6FF] shadow-[0_0_10px_rgba(183,139,255,.4)]"
                  />
                ))}
              </div>
              <p className="mt-2 text-center text-xs text-white/90">
                ≈ 100% активной игры
              </p>
            </div>
          </div>
        </Reveal>

        {/* Пункт 2 */}
        <Reveal className="grid gap-4 border-b border-white/[0.09] px-3 py-3 sm:grid-cols-[.95fr_2fr] sm:items-center sm:px-6">
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
            <SkillCard icon={Target} title="Форхенд" />
            <SkillCard icon={CircleDot} title="Бэкхенд" />
            <SkillCard icon={Moon} title="Приём подачи" />
            <SkillCard icon={Footprints} title="Работа ног" />
          </div>
        </Reveal>

        {/* Пункт 3 */}
        <Reveal className="grid gap-4 border-b border-white/[0.09] px-3 py-3 sm:grid-cols-[.95fr_2fr] sm:items-center sm:px-6">
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
            <SkillCard icon={Sun} title="Утро" />
            <SkillCard icon={Sun} title="День" />
            <SkillCard icon={Moon} title="Вечер" />
            <SkillCard icon={CalendarDays} title="Выходные" />
          </div>
        </Reveal>

        {/* Пункт 4 */}
        <Reveal className="relative grid grid-cols-[52px_1fr] items-center gap-3 overflow-hidden border-b border-white/[0.09] px-3 py-4 sm:grid-cols-[70px_1fr_250px] sm:px-6 sm:py-3">
          <div className="relative z-10">
            <NumberBlock n="4" />
          </div>

          <div className="relative z-10 text-center">
            <div className="text-[clamp(3.7rem,9vw,5.8rem)] font-black italic leading-[.9] tracking-[-.065em] text-transparent bg-gradient-to-b from-white via-[#D9B8FF] to-[#9D5BEF] bg-clip-text drop-shadow-[0_0_22px_rgba(168,121,255,.55)]">
              1000+
            </div>
            <div className="mt-2 text-sm font-extrabold uppercase tracking-wide text-white sm:text-lg">
              Ударов за тренировку
            </div>
          </div>

          <p className="col-span-2 mx-auto max-w-[360px] border-t border-[#A879FF]/30 pt-3 text-center text-xs leading-[1.45] text-white/75 sm:col-span-1 sm:mx-0 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0 sm:text-left sm:text-sm">
            Чем больше качественных повторений,
            тем быстрее формируется стабильный
            игровой навык.
          </p>

          <div className="pointer-events-none absolute inset-y-0 left-[10%] right-[18%] hidden bg-[radial-gradient(ellipse_at_center,rgba(143,91,255,.16),transparent_70%)] sm:block" />
        </Reveal>

        {/* Пункт 5 */}
        <Reveal className="grid gap-4 border-b border-white/[0.09] px-3 py-3 sm:grid-cols-[.95fr_2fr] sm:items-start sm:px-6">
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
              icon={ChartNoAxesCombined}
              title="Статистика тренировок"
              description="Отслеживайте свою активность и прогресс."
            />
            <SmallCard
              icon={SlidersHorizontal}
              title="Индивидуальные режимы"
              description="Создавайте собственные сценарии подачи."
            />
            <SmallCard
              icon={Trophy}
              title="Классическая партия"
              description="Приводите друзей, соперничайте или пробуйте новое."
            />
            <SmallCard
              icon={Trophy}
              title="Турниры участников"
              description="Соревнуйтесь с другими игроками."
            />
            <SmallCard
              icon={ChartNoAxesCombined}
              title="Аналитика развития"
              description="Видьте результаты своей работы."
            />
          </div>
        </Reveal>

        {/* Пункт 6 */}
        <Reveal className="grid gap-4 border-b border-white/[0.09] px-3 py-3 sm:grid-cols-[.95fr_2fr] sm:px-6">
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
            <div className="overflow-hidden rounded-xl border border-white/15 bg-gradient-to-br from-[#171329] to-[#090B15] p-2">
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

            <motion.div
              initial={reduced ? false : { opacity: 0, x: 18 }}
              whileInView={reduced ? undefined : { opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: easeOut }}
              className="relative mx-auto w-full max-w-[360px]"
            >
              <div className="absolute inset-0 rounded-full bg-[#8F5BFF]/20 blur-[50px]" />
              <CoachArtwork />
            </motion.div>
          </div>
        </Reveal>

        {/* Нижний призыв */}
        <Reveal className="grid gap-4 rounded-2xl border border-[#A879FF]/50 bg-gradient-to-r from-[#171329] via-[#171329] to-[#201438] px-4 py-5 shadow-[0_0_30px_rgba(143,91,255,.08)] sm:grid-cols-[1.1fr_1.3fr_auto_auto] sm:items-center sm:gap-5 sm:px-6">
          <h2 className="text-lg font-black leading-[1.2] tracking-[-.02em] text-white sm:text-xl">
            Каждая тренировка приближает
            <br className="hidden sm:block" />
            вас к следующему уровню.
          </h2>

          <p className="text-[11px] leading-[1.5] text-white/70 sm:border-l sm:border-white/15 sm:pl-5">
            Тренируйтесь тогда, когда удобно. Работайте над тем, что
            действительно важно. Получайте больше качественной практики
            за каждую минуту у стола.
          </p>

          <Link
            href="/pricing"
            className="group inline-flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#8747DB] to-[#A66AFF] px-6 py-3.5 text-sm font-extrabold text-white shadow-[0_6px_25px_rgba(143,91,255,.3)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_10px_32px_rgba(143,91,255,.5)]"
          >
            Выбрать тариф
            <span className="text-lg transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </Link>

          <div className="text-center text-xs leading-[1.4] text-white/75 sm:border-l sm:border-white/15 sm:pl-5">
            От 499 ₽
            <br />
            за тренировку
          </div>
        </Reveal>
      </div>
    </main>
  );
}
