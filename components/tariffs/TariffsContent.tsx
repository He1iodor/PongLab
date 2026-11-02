
"use client";

import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  Target,
  Zap,
  Crown,
} from "lucide-react";

const plans = [
  {
    name: "Start",
    price: "1 200",
    period: "разовая тренировка",
    note: "Для первого знакомства",
    color: "#F4F5FA",
    glow: "rgba(244,245,250,.18)",
    ball: "from-white via-[#E7EAF2] to-[#AEB5C7]",
    badge: "−50% новым пользователям",
    trainingCount: "1",
    trainingLabel: "тренировка",
    icon: Sparkles,
    features: [
      "Доступ к роботу-тренажёру",
      "Базовые режимы тренировок",
      "Онлайн-бронирование",
    ],
  },
  {
    name: "Base",
    price: "3 500",
    period: "в месяц",
    note: "Регулярная практика",
    color: "#65A9FF",
    glow: "rgba(75,145,255,.2)",
    ball: "from-[#BDE0FF] via-[#5DA9FF] to-[#2365C7]",
    trainingCount: "4",
    trainingLabel: "тренировки / месяц",
    icon: Target,
    features: [
      "4 тренировки в месяц",
      "Расширенные режимы",
      "История тренировок",
      "Доступ к турнирам выходного дня",
    ],
  },
  {
    name: "Advance",
    price: "6 500",
    period: "в месяц",
    note: "Системный прогресс",
    color: "#A987FF",
    glow: "rgba(143,91,255,.25)",
    ball: "from-[#E0D4FF] via-[#A987FF] to-[#6337C9]",
    popular: true,
    trainingCount: "8",
    trainingLabel: "тренировок / месяц",
    icon: Zap,
    features: [
      "8 тренировок в месяц",
      "Расширенные режимы",
      "История тренировок",
      "Доступ к турнирам выходного дня",
      "Индивидуально настраиваемые режимы",
    ],
  },
  {
    name: "Elite",
    price: "10 000",
    period: "в месяц",
    note: "Тренировки с сопровождением",
    color: "#FFB86B",
    glow: "rgba(255,160,75,.2)",
    ball: "from-[#FFE0B7] via-[#FFB86B] to-[#D66B27]",
    trainingCount: "8",
    trainingLabel: "тренировок / месяц",
    icon: Crown,
    features: [
      "8 тренировок",
      "Поддержка тренера",
      "Аналитика каждой тренировки",
      "Рекомендации после каждой тренировки",
    ],
  },
];

const comparison = [
  { label: "Формат", values: ["Разовая тренировка", "Подписка", "Подписка", "Подписка"] },
  { label: "Тренировки", values: ["1", "4 в месяц", "8 в месяц", "8"] },
  { label: "Доступ к роботу", values: [true, null, null, true] },
  { label: "Базовые режимы", values: [true, null, null, true] },
  { label: "Расширенные режимы", values: [false, true, true, true] },
  { label: "Индивидуальная настройка режимов", values: [false, false, true, true] },
  { label: "История тренировок", values: [false, true, true, true] },
  { label: "Турниры выходного дня", values: [false, true, true, true] },
  { label: "Поддержка тренера", values: [false, false, false, true] },
  { label: "Аналитика и рекомендации после каждой тренировки", values: [false, false, false, true] },
];

function FeatureMark({ value }: { value: boolean | null | string }) {
  if (typeof value === "string") {
    return <span className="text-sm font-medium text-white/80">{value}</span>;
  }

  if (value === null) {
    return <span className="text-white/25">—</span>;
  }

  return value ? (
    <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-[#8F5BFF]/15 text-[#BFA5FF]">
      <Check size={15} strokeWidth={2.8} />
    </span>
  ) : (
    <span className="text-white/20">—</span>
  );
}

export default function TariffsContent() {
  return (
    <div className="mx-auto max-w-[1540px]">
      <section className="grid items-start gap-12 xl:grid-cols-[minmax(260px,.78fr)_minmax(0,2fr)] xl:gap-14">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
          className="relative"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#8F5BFF]/30 bg-[#8F5BFF]/10 px-3.5 py-2 text-xs font-semibold uppercase tracking-[.16em] text-[#CDB4FF]">
            <Sparkles size={14} /> Тарифы PongLab
          </div>

          <h2 className="max-w-[560px] text-[clamp(2.5rem,5vw,5rem)] font-black leading-[.96] tracking-[-.055em]">
            Выбирайте свой
            <span className="block bg-gradient-to-r from-[#B99AFF] via-[#8F5BFF] to-[#6B9CFF] bg-clip-text text-transparent">
              ритм игры
            </span>
          </h2>

          <p className="mt-7 max-w-[470px] text-base leading-7 text-white/55 sm:text-lg">
            От первой тренировки до системной работы над техникой. Выберите формат, который подходит вашей цели.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-3 xl:grid-cols-1">
            {[
              {
                icon: Sparkles,
                title: "Тренировки без ожидания",
                text: "Выбирайте свободное время онлайн и занимайтесь в удобном ритме.",
              },
              {
                icon: BarChart3,
                title: "Понятный прогресс",
                text: "История и аналитика помогают видеть динамику занятий.",
              },
              {
                icon: ShieldCheck,
                title: "Автоматизированный доступ",
                text: "Бронирование и доступ к площадке связаны в одной системе.",
              },
            ].map((benefit, index) => {
              const Icon = benefit.icon;

              return (
                <motion.div
                  key={benefit.title}
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: 0.15 + index * 0.12,
                    duration: 0.75,
                    ease: "easeInOut",
                  }}
                  className="
                    flex gap-3 rounded-2xl
                    border border-white/[.07]
                    bg-white/[.035] p-4
                    transition-all duration-700 ease-in-out
                    hover:border-[#8F5BFF]/40
                    hover:bg-white/[.055]
                  "
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#8F5BFF]/15 text-[#BFA5FF]">
                    <Icon size={19} />
                  </span>

                  <span>
                    <span className="block text-sm font-semibold text-white/90">
                      {benefit.title}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-white/45">
                      {benefit.text}
                    </span>
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-4">
          {plans.map((plan, index) => {
            const Icon = plan.icon;

            return (
              <motion.article
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.75,
                  delay: 0.1 * index,
                  ease: "easeInOut",
                }}
                whileHover={{
                  y: -7,
                  transition: { duration: 0.7, ease: "easeInOut" },
                }}
                className={`
                  group relative flex min-h-[410px] flex-col
                  overflow-hidden rounded-[25px]
                  border bg-[#111427]/80 p-5
                  backdrop-blur-xl sm:p-6
                  transition-all duration-700 ease-in-out
                  ${
                    plan.popular
                      ? "border-[#9A75FF]/65 shadow-[0_0_45px_rgba(143,91,255,.13)]"
                      : "border-white/10"
                  }
                `}
                style={{
                  boxShadow: plan.popular
                    ? undefined
                    : `0 18px 55px ${plan.glow}`,
                }}
              >
                <div
                  className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full blur-[65px] transition-transform duration-1000 ease-in-out group-hover:scale-125"
                  style={{ background: plan.glow }}
                />

                <div className="relative flex items-start justify-between gap-2">
                  <div>
                    <p
                      className="text-xs font-semibold uppercase tracking-[.2em]"
                      style={{ color: plan.color }}
                    >
                      {plan.note}
                    </p>
                    <h3 className="mt-2 text-3xl font-black tracking-tight">
                      {plan.name}
                    </h3>
                  </div>

                  <motion.div
                    aria-hidden="true"
                    whileHover={{ rotate: 12, scale: 1.08 }}
                    transition={{ duration: 0.75, ease: "easeInOut" }}
                    className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[.045]"
                    style={{
                      color: plan.color,
                      boxShadow: `0 0 24px ${plan.glow}`,
                    }}
                  >
                    <Icon size={22} strokeWidth={1.8} />
                  </motion.div>
                </div>

                {plan.popular && (
                  <div className="relative mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-[#A987FF]/35 bg-[#8F5BFF]/15 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#D4C2FF]">
                    <Sparkles size={12} />
                    Самый популярный
                  </div>
                )}

                {plan.badge && (
                  <div className="relative mt-5 inline-flex w-fit rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white/85">
                    {plan.badge}
                  </div>
                )}

                <div className="relative mt-6 flex items-end gap-1">
                  <span className="text-[2.45rem] font-black leading-none tracking-[-.06em]">
                    {plan.price}
                  </span>
                  <span className="pb-1 text-lg font-semibold text-white/70">
                    ₽
                  </span>
                </div>

                <p className="relative mt-2 text-xs text-white/40">
                  {plan.period}
                </p>

                {/* Количество тренировок — крупно и заметно */}
                <div className="relative mt-6 flex items-end gap-3 rounded-2xl border border-white/[.08] bg-white/[.045] px-4 py-3">
                  <span
                    className="text-[3.5rem] font-black leading-[.85] tracking-[-.07em]"
                    style={{
                      color: plan.color,
                      textShadow: `0 0 24px ${plan.glow}`,
                    }}
                  >
                    {plan.trainingCount}
                  </span>
                  <span className="pb-1 text-xs font-semibold leading-5 text-white/65">
                    {plan.trainingLabel}
                  </span>
                </div>

                <div className="relative my-6 h-px bg-white/10" />

                <ul className="relative flex-1 space-y-3.5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-[13px] leading-5 text-white/75"
                    >
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                        style={{
                          background: plan.glow,
                          color: plan.color,
                        }}
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="relative mt-6 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-white/35">
                  <span>
                    {plan.name === "Start" ? "Без подписки" : "Оплата за месяц"}
                  </span>
                  <ArrowUpRight size={16} style={{ color: plan.color }} />
                </div>
              </motion.article>
            );
          })}

          <p className="text-xs leading-5 text-white/40 sm:col-span-2 2xl:col-span-4">
            * Добавление дополнительной тренировки к действующему пакету 750₽
          </p>
        </div>
      </section>

      <section className="mt-24 sm:mt-28">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#A98AFF]">
              Сравнение возможностей
            </p>
            <h3 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              Что входит в тарифы
            </h3>
          </div>
          <p className="max-w-md text-xs leading-5 text-white/40">
            В таблице отмечены возможности каждого тарифа.
          </p>
        </div>

        <div className="overflow-x-auto rounded-[22px] border border-white/10 bg-white/[.025]">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="bg-white/[.045]">
                <th className="w-[32%] px-5 py-4 text-xs font-semibold uppercase tracking-wider text-white/45">
                  Возможности
                </th>
                {plans.map((plan) => (
                  <th
                    key={plan.name}
                    className="px-4 py-4 text-center text-sm font-bold"
                    style={{ color: plan.color }}
                  >
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.map((row, index) => (
                <tr
                  key={row.label}
                  className={index % 2 === 0 ? "bg-white/[.015]" : ""}
                >
                  <td className="border-t border-white/[.06] px-5 py-4 text-sm text-white/65">
                    {row.label}
                  </td>
                  {row.values.map((value, valueIndex) => (
                    <td
                      key={valueIndex}
                      className="border-t border-white/[.06] px-4 py-4 text-center"
                    >
                      <FeatureMark value={value} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="relative mt-20 overflow-hidden rounded-[26px] border border-[#8F5BFF]/20 bg-gradient-to-r from-[#6B30CE]/15 via-[#17142C] to-[#244B8A]/15 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full bg-[#8F5BFF]/15 blur-[80px]" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[.07] text-[#C7B0FF]">
              <Trophy size={22} />
            </span>
            <div>
              <h3 className="text-lg font-bold sm:text-xl">
                Сосредоточьтесь на игре
              </h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-white/50">
                Бронирование, доступ к площадке и тренировки с роботом — в единой системе PongLab.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs font-semibold text-white/55">
            <UserRound size={16} />
            Ваш темп. Ваш прогресс.
          </div>
        </div>
      </section>
    </div>
  );
}
