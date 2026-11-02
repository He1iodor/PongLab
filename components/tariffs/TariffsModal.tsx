
"use client";

import { useState, type CSSProperties, type PointerEvent } from "react";
import {
  X,
  Check,
  Target,
  CalendarDays,
  ChartNoAxesCombined,
  ShieldCheck,
  Info,
  ArrowRight,
  LockKeyhole,
  Headset,
  Clock3,
  Dumbbell,
} from "lucide-react";

type PlanId = "start" | "base" | "advance" | "elite";

interface TariffsModalProps {
  open: boolean;
  onClose: () => void;
  onSelectPlan?: (plan: PlanId) => void;
}

const plans = [
  {
    id: "start" as const,
    name: "Start",
    subtitle: "Для первого знакомства",
    price: "1 200",
    period: "разовый формат",
    color: "white",
    features: [
      "Доступ к роботу",
      "Базовые режимы",
      "Онлайн-бронирование",
    ],
    note: "−50% новым пользователям",
  },
  {
    id: "base" as const,
    name: "Base",
    subtitle: "Регулярные тренировки",
    price: "3 500",
    period: "в месяц",
    color: "blue",
    features: [
      "4 занятия в месяц",
      "Все из тарифа Start",
      "Расширенные режимы",
      "История тренировок",
      "Доступ к турнирам выходного дня",
    ],
    note: "Для регулярной практики",
  },
  {
    id: "advance" as const,
    name: "Advance",
    subtitle: "Для прогресса и результата",
    price: "6 500",
    period: "в месяц",
    color: "purple",
    popular: true,
    features: [
      "8 занятий в месяц",
      "Все из тарифа Base",
      "Расширенные режимы",
      "История тренировок",
      "Доступ к турнирам выходного дня",
      "Индивидуально настраиваемые режимы",
    ],
    note: "Больше возможностей",
  },
  {
    id: "elite" as const,
    name: "Elite",
    subtitle: "Индивидуальный подход",
    price: "10 000",
    period: "в месяц",
    color: "gold",
    features: [
      "8 занятий в месяц",
      "Сопровождение тренера",
      "Аналитика и рекомендации каждой тренировки",
    ],
    note: "Максимум внимания к результату",
  },
];

const comparison = [
  {
    name: "Занятия в месяц",
    values: ["1", "4", "8", "8"],
  },
  {
    name: "Доступ к роботу",
    values: [true, true, true, null],
  },
  {
    name: "Базовые режимы",
    values: [true, true, true, null],
  },
  {
    name: "Онлайн-бронирование",
    values: [true, true, true, null],
  },
  {
    name: "Расширенные режимы",
    values: [false, true, true, null],
  },
  {
    name: "История тренировок",
    values: [false, true, true, null],
  },
  {
    name: "Турниры выходного дня",
    values: [false, true, true, null],
  },
  {
    name: "Индивидуальная настройка",
    values: [false, false, true, null],
  },
  {
    name: "Сопровождение тренера",
    values: [false, false, false, true],
  },
  {
    name: "Аналитика и рекомендации",
    values: [false, false, false, true],
  },
];

function PingPongBall({ color }: { color: string }) {
  return (
    <div className={`tariff-ball tariff-ball-${color}`}>
      <span className="tariff-ball-seam" />
    </div>
  );
}

function FeatureIcon({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#9C5CFF]/25 bg-[#8B45F5]/10 text-[#B77AFF]">
      {children}
    </div>
  );
}

export default function TariffsModal({
  open,
  onClose,
  onSelectPlan,
}: TariffsModalProps) {
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  if (!open) return null;

  const handlePointerMove = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (event.pointerType !== "mouse") return;

    const rect = event.currentTarget.getBoundingClientRect();

    setPointer({
      x: (event.clientX - rect.left) / rect.width - 0.5,
      y: (event.clientY - rect.top) / rect.height - 0.5,
    });
  };

  const choosePlan = (id: PlanId) => {
    setSelected(id);
    onSelectPlan?.(id);
  };

  const parallaxStyle = {
    transform: `translate3d(${pointer.x * -16}px, ${pointer.y * -16}px, 0)`,
  } as CSSProperties;

  return (
    <div
      className="tariffs-overlay"
      onClick={onClose}
    >
      <div
        className="tariffs-window"
        role="dialog"
        aria-modal="true"
        aria-label="Тарифы PongLab"
        onClick={(e) => e.stopPropagation()}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setPointer({ x: 0, y: 0 })}
      >
        {/* Background effects */}

        <div className="tariffs-background">
          <div
            className="tariffs-glow tariffs-glow-one"
            style={parallaxStyle}
          />
          <div
            className="tariffs-glow tariffs-glow-two"
            style={{
              transform: `translate3d(${pointer.x * 22}px, ${pointer.y * 22}px, 0)`,
            }}
          />
          <div className="tariffs-grid" />
        </div>

        {/* Header */}

        <header className="tariffs-header">
          <div className="tariffs-logo">
            <div className="tariffs-logo-mark">
              <PingPongBall color="purple" />
            </div>
            <span>
              PongLab<sup>®</sup>
            </span>
          </div>

          <button
            type="button"
            className="tariffs-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={24} />
          </button>
        </header>

        {/* Main content */}

        <main className="tariffs-layout">

          {/* LEFT SIDE */}

          <aside className="tariffs-sidebar">

            <div className="tariffs-heading">
              <span className="tariffs-eyebrow">
                PONGLAB MEMBERSHIP
              </span>

              <h1>
                Выберите
                <br />
                свой уровень
              </h1>

              <p>
                Каждый тариф создан, чтобы помочь вам
                тренироваться больше, прогрессировать быстрее
                и достигать своих целей.
              </p>
            </div>

            <div className="tariffs-benefits">

              <div className="tariffs-benefit">
                <FeatureIcon>
                  <Target size={27} />
                </FeatureIcon>

                <div>
                  <h3>Максимум практики</h3>
                  <p>
                    Используйте время тренировки на 100%
                    и получайте больше качественных повторений.
                  </p>
                </div>
              </div>

              <div className="tariffs-benefit">
                <FeatureIcon>
                  <CalendarDays size={27} />
                </FeatureIcon>

                <div>
                  <h3>Гибкий график</h3>
                  <p>
                    Выбирайте удобное время и тренируйтесь
                    без ожиданий.
                  </p>
                </div>
              </div>

              <div className="tariffs-benefit">
                <FeatureIcon>
                  <ChartNoAxesCombined size={27} />
                </FeatureIcon>

                <div>
                  <h3>Реальный прогресс</h3>
                  <p>
                    Аналитика, история тренировок
                    и отслеживание результатов.
                  </p>
                </div>
              </div>

              <div className="tariffs-benefit">
                <FeatureIcon>
                  <ShieldCheck size={27} />
                </FeatureIcon>

                <div>
                  <h3>Технологии для победы</h3>
                  <p>
                    Умный робот, индивидуальные режимы
                    и точная настройка каждой подачи.
                  </p>
                </div>
              </div>

            </div>

            {/* Help card */}

            <div className="tariffs-help">
              <div className="flex items-center gap-3">
                <Info className="text-[#B77AFF]" size={22} />
                <h3>Не уверены в выборе?</h3>
              </div>

              <p>
                Попробуйте разовую тренировку
                и убедитесь сами.
              </p>

              <button
                type="button"
                onClick={() => choosePlan("start")}
              >
                Разовая тренировка
                <ArrowRight size={17} />
              </button>
            </div>

          </aside>

          {/* RIGHT SIDE */}

          <section className="tariffs-main">

            {/* Cards */}

            <div className="tariffs-cards">

              {plans.map((plan, index) => (
                <article
                  key={plan.id}
                  className={[
                    "tariff-card",
                    `tariff-card-${plan.color}`,
                    plan.popular ? "tariff-card-popular" : "",
                    selected === plan.id ? "tariff-card-selected" : "",
                  ].join(" ")}
                  style={{
                    animationDelay: `${index * 100}ms`,
                  }}
                >

                  {plan.popular && (
                    <div className="tariff-popular">
                      ✦ Самый популярный
                    </div>
                  )}

                  <div className="tariff-card-heading">

                    <div>
                      <h2>{plan.name}</h2>
                      <p>{plan.subtitle}</p>
                    </div>

                    <PingPongBall color={plan.color} />

                  </div>

                  <div className="tariff-accent-line" />

                  <div className="tariff-price">
                    <strong>{plan.price} ₽</strong>
                    <span>{plan.period}</span>
                  </div>

                  {plan.id === "start" && (
                    <div className="tariff-discount">
                      −50% для новых пользователей
                    </div>
                  )}

                  <ul className="tariff-features">
                    {plan.features.map((feature, i) => (
                      <li key={`${plan.id}-${i}`}>
                        <span className="tariff-check">
                          <Check size={12} strokeWidth={3} />
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="tariff-card-bottom">

                    <button
                      type="button"
                      className="tariff-select"
                      onClick={() => choosePlan(plan.id)}
                    >
                      {selected === plan.id
                        ? "Выбран"
                        : plan.id === "start"
                          ? "Попробовать"
                          : "Выбрать"}
                    </button>

                    <span>{plan.note}</span>

                  </div>

                </article>
              ))}

            </div>

            {/* Additional training note */}

            <div className="tariff-extra-note">
              <span>*</span>
              Добавление дополнительной тренировки
              к действующему пакету — <strong>750 ₽</strong>
            </div>

            {/* Comparison table */}

            <div className="tariffs-comparison">

              <div className="tariffs-comparison-heading">
                <div>Что включено</div>
                {plans.map((plan) => (
                  <div key={plan.id}>{plan.name}</div>
                ))}
              </div>

              {comparison.map((row) => (
                <div
                  className="tariffs-comparison-row"
                  key={row.name}
                >
                  <div className="tariffs-comparison-label">
                    {row.name}
                  </div>

                  {row.values.map((value, index) => (
                    <div
                      className={`tariffs-comparison-cell tariff-cell-${plans[index].color}`}
                      key={`${row.name}-${index}`}
                    >
                      {value === true ? (
                        <Check size={16} strokeWidth={3} />
                      ) : value === false ? (
                        <span className="tariff-dash">—</span>
                      ) : value === null ? (
                        <span className="tariff-dash">—</span>
                      ) : (
                        value
                      )}
                    </div>
                  ))}
                </div>
              ))}

            </div>

            {/* Trust strip */}

            <div className="tariffs-trust">

              <div>
                <LockKeyhole size={25} />
                <section>
                  <h4>Без скрытых платежей</h4>
                  <p>
                    Вы платите только за то,
                    чем действительно пользуетесь.
                  </p>
                </section>
              </div>

              <div>
                <Clock3 size={25} />
                <section>
                  <h4>Отмена в любое время</h4>
                  <p>
                    Управляйте бронированием
                    в личном кабинете.
                  </p>
                </section>
              </div>

              <div>
                <ShieldCheck size={25} />
                <section>
                  <h4>Безопасная оплата</h4>
                  <p>
                    Ваши данные и платежи
                    надежно защищены.
                  </p>
                </section>
              </div>

              <div>
                <Headset size={25} />
                <section>
                  <h4>Поддержка</h4>
                  <p>
                    Мы готовы помочь
                    с любыми вопросами.
                  </p>
                </section>
              </div>

            </div>

          </section>
        </main>

      </div>

      <style jsx>{`
        .tariffs-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
          background: rgba(2, 3, 10, .88);
          backdrop-filter: blur(16px);
          animation: overlayIn .35s ease both;
        }

        .tariffs-window {
          position: relative;
          isolation: isolate;
          width: min(100%, 1600px);
          max-height: calc(100dvh - 24px);
          overflow-y: auto;
          overflow-x: hidden;
          border: 1px solid rgba(255,255,255,.23);
          border-radius: 22px;
          padding: 20px 26px 28px;
          color: #fff;
          background: #080b14;
          box-shadow: 0 30px 120px rgba(0,0,0,.7);
          animation: windowIn .55s cubic-bezier(.2,.8,.2,1) both;
          scrollbar-width: thin;
          scrollbar-color: #7540b8 transparent;
        }

        .tariffs-background {
          position: absolute;
          inset: 0;
          z-index: -1;
          overflow: hidden;
          pointer-events: none;
        }

        .tariffs-grid {
          position: absolute;
          inset: 0;
          opacity: .22;
          background-image:
            linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
          background-size: 72px 72px;
          mask-image: linear-gradient(to bottom, black, transparent 95%);
        }

        .tariffs-glow {
          position: absolute;
          width: 650px;
          height: 650px;
          border-radius: 50%;
          filter: blur(150px);
          transition: transform .25s ease-out;
        }

        .tariffs-glow-one {
          top: 0;
          left: 25%;
          background: rgba(104,43,188,.17);
        }

        .tariffs-glow-two {
          right: -250px;
          bottom: -300px;
          background: rgba(92,40,175,.12);
        }

        .tariffs-header {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 48px;
          margin-bottom: 12px;
        }

        .tariffs-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -.04em;
        }

        .tariffs-logo sup {
          margin-left: 2px;
          font-size: 9px;
        }

        .tariffs-logo-mark {
          display: flex;
          width: 46px;
          height: 46px;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(164,93,255,.65);
          border-radius: 50%;
          background: rgba(119,54,206,.12);
        }

        .tariffs-close {
          display: flex;
          width: 44px;
          height: 44px;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 12px;
          color: white;
          background: rgba(255,255,255,.04);
          transition: .2s ease;
        }

        .tariffs-close:hover {
          background: rgba(255,255,255,.13);
          transform: rotate(90deg);
        }

        .tariffs-layout {
          display: grid;
          grid-template-columns: minmax(245px, 330px) minmax(0, 1fr);
          gap: 38px;
          align-items: start;
        }

        .tariffs-sidebar {
          display: flex;
          flex-direction: column;
          gap: 28px;
          padding: 10px 0 0;
        }

        .tariffs-eyebrow {
          display: inline-block;
          margin-bottom: 17px;
          color: #b77aff;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .22em;
        }

        .tariffs-heading h1 {
          margin: 0;
          font-size: clamp(34px, 3.2vw, 48px);
          font-weight: 850;
          line-height: .99;
          letter-spacing: -.055em;
        }

        .tariffs-heading > p {
          margin-top: 17px;
          color: #aeb3c2;
          font-size: 13px;
          line-height: 1.65;
        }

        .tariffs-benefits {
          display: flex;
          flex-direction: column;
          gap: 23px;
        }

        .tariffs-benefit {
          display: flex;
          align-items: flex-start;
          gap: 15px;
        }

        .tariffs-benefit h3 {
          margin: 1px 0 5px;
          font-size: 14px;
          font-weight: 750;
        }

        .tariffs-benefit p {
          color: #9ea4b4;
          font-size: 12px;
          line-height: 1.55;
        }

        .tariffs-help {
          padding: 17px;
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 17px;
          background: linear-gradient(135deg, rgba(255,255,255,.045), rgba(255,255,255,.012));
        }

        .tariffs-help h3 {
          font-size: 14px;
          font-weight: 700;
        }

        .tariffs-help p {
          margin: 10px 0 15px 34px;
          color: #aeb3c2;
          font-size: 12px;
          line-height: 1.5;
        }

        .tariffs-help button {
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: center;
          gap: 9px;
          padding: 10px;
          border: 1px solid #9b52f5;
          border-radius: 11px;
          color: #c18bff;
          font-size: 13px;
          font-weight: 650;
          transition: .2s ease;
        }

        .tariffs-help button:hover {
          background: rgba(144,69,233,.15);
          box-shadow: 0 0 25px rgba(144,69,233,.15);
        }

        .tariffs-main {
          min-width: 0;
          padding-top: 42px;
        }

        .tariffs-cards {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 5px;
          align-items: stretch;
        }

        .tariff-card {
          --accent: #fff;
          position: relative;
          display: flex;
          min-width: 0;
          flex-direction: column;
          padding: 25px 17px 18px;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 17px;
          background: linear-gradient(155deg, rgba(255,255,255,.075), rgba(255,255,255,.012) 75%);
          animation: cardIn .65s cubic-bezier(.2,.8,.2,1) both;
          transition: transform .3s ease, border-color .3s ease, box-shadow .3s ease;
        }

        .tariff-card:hover {
          transform: translateY(-7px);
          border-color: var(--accent);
          box-shadow: 0 15px 45px rgba(0,0,0,.28);
        }

        .tariff-card-white { --accent: #e4e9f2; }
        .tariff-card-blue { --accent: #3988ff; }
        .tariff-card-purple { --accent: #a34bff; }
        .tariff-card-gold { --accent: #e5a600; }

        .tariff-card-white { border-color: rgba(215,225,240,.28); }
        .tariff-card-blue { border-color: rgba(57,136,255,.38); }
        .tariff-card-purple {
          border-color: rgba(163,75,255,.62);
          background: linear-gradient(160deg, rgba(108,48,169,.25), rgba(255,255,255,.025) 75%);
        }
        .tariff-card-gold { border-color: rgba(229,166,0,.4); }

        .tariff-card-selected {
          box-shadow: 0 0 0 2px var(--accent), 0 15px 40px rgba(0,0,0,.3);
        }

        .tariff-popular {
          position: absolute;
          top: -36px;
          left: -1px;
          right: -1px;
          display: flex;
          height: 36px;
          align-items: center;
          justify-content: center;
          border: 1px solid #9b4df3;
          border-bottom: none;
          border-radius: 15px 15px 0 0;
          color: #fff;
          background: linear-gradient(90deg, #6423ad, #9b32ee);
          font-size: 11px;
          font-weight: 700;
        }

        .tariff-card-heading {
          display: flex;
          min-height: 64px;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }

        .tariff-card-heading h2 {
          font-size: 19px;
          font-weight: 800;
          letter-spacing: -.04em;
        }

        .tariff-card-heading p {
          margin-top: 5px;
          color: #b7bdcb;
          font-size: 10px;
          line-height: 1.4;
        }

        .tariff-ball {
          position: relative;
          width: 36px;
          height: 36px;
          flex: 0 0 36px;
          overflow: hidden;
          border-radius: 50%;
          background: radial-gradient(circle at 32% 25%, #fff 0%, var(--ball-light) 17%, var(--ball-color) 60%, var(--ball-dark) 100%);
          box-shadow: inset -5px -7px 12px rgba(0,0,0,.25), 0 5px 18px rgba(0,0,0,.35);
          transition: transform .35s ease;
        }

        .tariff-card:hover .tariff-ball {
          transform: translateY(-4px) rotate(18deg);
        }

        .tariff-ball-seam {
          position: absolute;
          inset: 4px;
          border: 1px solid rgba(255,255,255,.38);
          border-radius: 50%;
          transform: rotate(-35deg) scaleX(.48);
        }

        .tariff-ball-white {
          --ball-light: #fff;
          --ball-color: #dce3ee;
          --ball-dark: #8290a5;
        }
        .tariff-ball-blue {
          --ball-light: #d9eaff;
          --ball-color: #478eff;
          --ball-dark: #1445a1;
        }
        .tariff-ball-purple {
          --ball-light: #f0d8ff;
          --ball-color: #a34bff;
          --ball-dark: #57209d;
        }
        .tariff-ball-gold {
          --ball-light: #fff0a9;
          --ball-color: #e6a000;
          --ball-dark: #985000;
        }

        .tariff-accent-line {
          width: 22px;
          height: 2px;
          margin: 11px 0 19px;
          background: var(--accent);
          box-shadow: 0 0 12px var(--accent);
        }

        .tariff-price {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .tariff-price strong {
          font-size: clamp(21px, 1.9vw, 30px);
          font-weight: 850;
          white-space: nowrap;
          letter-spacing: -.045em;
        }

        .tariff-price span {
          color: #d8dce6;
          font-size: 11px;
          font-weight: 650;
        }

        .tariff-discount {
          margin-top: 9px;
          color: #c18bff;
          font-size: 10px;
          font-weight: 750;
        }

        .tariff-features {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 12px;
          margin: 24px 0 25px;
        }

        .tariff-features li {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          color: #d0d4df;
          font-size: 10px;
          line-height: 1.45;
        }

        .tariff-check {
          display: flex;
          width: 15px;
          height: 15px;
          flex: 0 0 15px;
          align-items: center;
          justify-content: center;
          margin-top: 0;
          border-radius: 50%;
          color: #080b14;
          background: var(--accent);
        }

        .tariff-card-bottom {
          display: flex;
          flex-direction: column;
          gap: 11px;
          margin-top: auto;
        }

        .tariff-select {
          width: 100%;
          min-height: 42px;
          border: 1px solid var(--accent);
          border-radius: 11px;
          color: #fff;
          background: transparent;
          font-size: 13px;
          font-weight: 750;
          transition: .25s ease;
        }

        .tariff-card-purple .tariff-select {
          border-color: transparent;
          background: linear-gradient(110deg, #762bd0, #a74bfa);
        }

        .tariff-card:hover .tariff-select,
        .tariff-select:hover {
          color: #fff;
          background: var(--accent);
          box-shadow: 0 0 20px color-mix(in srgb, var(--accent) 25%, transparent);
        }

        .tariff-card-bottom > span {
          min-height: 15px;
          color: var(--accent);
          text-align: center;
          font-size: 10px;
        }

        .tariff-extra-note {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin: 13px 0 15px;
          color: #aeb3c2;
          font-size: 12px;
        }

        .tariff-extra-note > span {
          color: #b77aff;
          font-weight: 800;
        }

        .tariff-extra-note strong {
          color: white;
        }

        .tariffs-comparison {
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.13);
          border-radius: 15px;
          background: rgba(255,255,255,.025);
        }

        .tariffs-comparison-heading,
        .tariffs-comparison-row {
          display: grid;
          grid-template-columns: minmax(155px, 1.25fr) repeat(4, minmax(75px, 1fr));
          align-items: center;
        }

        .tariffs-comparison-heading {
          min-height: 37px;
          background: rgba(255,255,255,.045);
          font-size: 12px;
          font-weight: 750;
        }

        .tariffs-comparison-heading > div:not(:first-child) {
          text-align: center;
        }

        .tariffs-comparison-heading > div,
        .tariffs-comparison-label,
        .tariffs-comparison-cell {
          padding: 7px 10px;
        }

        .tariffs-comparison-row {
          min-height: 27px;
          border-top: 1px solid rgba(255,255,255,.07);
          color: #c7ccd7;
          font-size: 11px;
        }

        .tariffs-comparison-label {
          color: #d5d9e2;
        }

        .tariffs-comparison-cell {
          display: flex;
          align-items: center;
          justify-content: center;
          border-left: 1px solid rgba(255,255,255,.055);
          font-size: 11px;
        }

        .tariff-cell-white { color: #e6eaf1; }
        .tariff-cell-blue { color: #438cff; }
        .tariff-cell-purple { color: #b66cff; }
        .tariff-cell-gold { color: #efb52b; }

        .tariff-dash {
          color: #777e8d;
        }

        .tariffs-trust {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 15px;
          margin-top: 35px;
          padding: 16px;
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 15px;
          background: rgba(4,7,15,.45);
        }

        .tariffs-trust > div {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }

        .tariffs-trust svg {
          flex: 0 0 23px;
          color: #d9dce6;
        }

        .tariffs-trust h4 {
          font-size: 11px;
          font-weight: 750;
        }

        .tariffs-trust p {
          margin-top: 5px;
          color: #969eae;
          font-size: 10px;
          line-height: 1.45;
        }

        @keyframes overlayIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes windowIn {
          from { opacity: 0; transform: translateY(22px) scale(.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes cardIn {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 1150px) {
          .tariffs-layout {
            grid-template-columns: 230px minmax(0, 1fr);
            gap: 22px;
          }

          .tariff-card {
            padding: 20px 12px 15px;
          }

          .tariff-card-heading h2 {
            font-size: 16px;
          }

          .tariff-card-heading p {
            font-size: 9px;
          }

          .tariff-ball {
            width: 30px;
            height: 30px;
            flex-basis: 30px;
          }

          .tariff-features li {
            font-size: 9px;
          }

          .tariffs-trust {
            gap: 9px;
            padding: 12px;
          }
        }

        @media (max-width: 850px) {
          .tariffs-window {
            padding: 16px;
          }

          .tariffs-layout {
            grid-template-columns: 1fr;
            gap: 24px;
          }

          .tariffs-sidebar {
            gap: 18px;
          }

          .tariffs-heading h1 {
            font-size: 37px;
          }

          .tariffs-benefits {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
          }

          .tariffs-help {
            display: none;
          }

          .tariffs-main {
            padding-top: 15px;
          }

          .tariffs-cards {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }

          .tariff-card {
            padding: 20px 16px;
          }

          .tariff-price strong {
            font-size: 27px;
          }

          .tariff-features li {
            font-size: 11px;
          }

          .tariffs-trust {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 520px) {
          .tariffs-overlay {
            padding: 0;
            align-items: stretch;
          }

          .tariffs-window {
            width: 100%;
            max-height: 100dvh;
            border: none;
            border-radius: 0;
            padding: 12px 14px 25px;
          }

          .tariffs-header {
            margin-bottom: 16px;
          }

          .tariffs-logo {
            font-size: 16px;
          }

          .tariffs-logo-mark {
            width: 39px;
            height: 39px;
          }

          .tariffs-close {
            width: 39px;
            height: 39px;
          }

          .tariffs-heading h1 {
            font-size: 35px;
          }

          .tariffs-heading > p {
            font-size: 12px;
          }

          .tariffs-benefits {
            grid-template-columns: 1fr;
            gap: 15px;
          }

          .tariffs-benefit p {
            max-width: 290px;
          }

          .tariffs-main {
            padding-top: 7px;
          }

          .tariffs-cards {
            grid-template-columns: 1fr;
            gap: 16px;
            padding-top: 28px;
          }

          .tariff-card {
            padding: 21px 19px 17px;
          }

          .tariff-card-heading h2 {
            font-size: 20px;
          }

          .tariff-card-heading p {
            font-size: 11px;
          }

          .tariff-ball {
            width: 38px;
            height: 38px;
            flex-basis: 38px;
          }

          .tariff-price strong {
            font-size: 29px;
          }

          .tariff-features {
            gap: 12px;
            margin: 20px 0;
          }

          .tariff-features li {
            font-size: 11px;
          }

          .tariff-select {
            min-height: 46px;
          }

          .tariff-extra-note {
            font-size: 11px;
            line-height: 1.6;
          }

          .tariffs-comparison {
            overflow-x: auto;
          }

          .tariffs-comparison-heading,
          .tariffs-comparison-row {
            min-width: 570px;
            grid-template-columns: 190px repeat(4, 95px);
          }

          .tariffs-comparison-row {
            min-height: 35px;
          }

          .tariffs-trust {
            grid-template-columns: 1fr;
            gap: 18px;
            margin-top: 22px;
            padding: 17px;
          }

          .tariffs-trust p {
            font-size: 11px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .tariffs-overlay,
          .tariffs-window,
          .tariff-card {
            animation: none !important;
          }

          .tariff-card,
          .tariff-ball,
          .tariffs-close {
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
