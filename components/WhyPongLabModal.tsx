"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";

import Image from "next/image";

import {
  X,
  ArrowRight,
  Clock3,
  Target,
  Trophy,
  Brain,
  Zap,
  BarChart3,
  Users,
} from "lucide-react";

import {
  useEffect,
  useCallback,
  useRef,
} from "react";

interface WhyPongLabModalProps {
  open: boolean;
  onClose: () => void;
}

export default function WhyPongLabModal({
  open,
  onClose,
}: WhyPongLabModalProps) {
  const reduceMotion = useReducedMotion();

  const backdropRef = useRef<HTMLDivElement>(null);

  const handleBackdropClick = (
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = "hidden";

    window.addEventListener("keydown", handleEsc);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener(
        "keydown",
        handleEsc
      );
    };
  }, [open, handleEsc]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={backdropRef}
          onClick={handleBackdropClick}
          initial={{
            opacity: 0,
          }}
          animate={{
            opacity: 1,
          }}
          exit={{
            opacity: 0,
          }}
          transition={{
            duration: 0.25,
          }}
          className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-md flex items-center justify-center p-3 md:p-6"
        >
          <motion.div
            initial={{
              opacity: 0,
              scale: reduceMotion ? 1 : 0.96,
              y: reduceMotion ? 0 : 20,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              scale: reduceMotion ? 1 : 0.96,
            }}
            transition={{
              duration: 0.35,
              ease: "easeOut",
            }}
            className="
              relative
              w-full
              max-w-[1700px]
              h-[94vh]
              rounded-[32px]
              border
              border-white/10
              bg-[#0B1020]
              overflow-hidden
              shadow-[0_40px_120px_rgba(0,0,0,0.6)]
            "
          >
            <button
              onClick={onClose}
              className="
                absolute
                top-5
                right-5
                z-50
                w-12
                h-12
                rounded-full
                border
                border-white/10
                bg-white/5
                backdrop-blur
                flex
                items-center
                justify-center
                text-white/80
                hover:text-white
                hover:bg-white/10
                transition
              "
            >
              <X size={22} />
            </button>

            {/* scroll container */}

            <div
              className="
                h-full
                overflow-y-auto
                snap-y
                snap-mandatory
                no-scrollbar
                scroll-smooth
              "
            >
              {/* SECTION 1 */}

              <section
                className="
                  min-h-[92vh]
                  snap-start
                  px-8
                  md:px-14
                  py-16
                  flex
                  items-center
                "
              >
                <div className="grid lg:grid-cols-2 gap-16 items-center w-full">
                  <div>
                    <div
                      className="
                        inline-flex
                        items-center
                        gap-2
                        px-4
                        py-2
                        rounded-full
                        border
                        border-[#8F5BFF]/30
                        bg-[#8F5BFF]/10
                        text-[#CDB8FF]
                        text-sm
                        mb-6
                      "
                    >
                      <Zap size={16} />
                      Почему игроки выбирают PongLab
                    </div>

                    <h2
                      className="
                        text-5xl
                        md:text-7xl
                        font-black
                        leading-[0.95]
                        text-white
                      "
                    >
                      Тренируйся
                      <br />
                      эффективнее.
                      <br />
                      <span className="text-[#8F5BFF]">
                        Прогрессируй
                      </span>
                      <br />
                      быстрее.
                    </h2>

                    <p
                      className="
                        mt-8
                        text-lg
                        md:text-xl
                        text-white/70
                        max-w-xl
                      "
                    >
                      До 10 раз больше игровых
                      повторений за тренировку.
                      Максимум практики.
                      Максимум контроля.
                      Максимум прогресса.
                    </p>

                    <div className="mt-10 flex flex-wrap gap-4">
                      <div
                        className="
                          bg-white/5
                          border
                          border-white/10
                          rounded-2xl
                          px-5
                          py-4
                        "
                      >
                        <div className="text-4xl font-black text-[#8F5BFF]">
                          10x
                        </div>

                        <div className="text-white/60 text-sm">
                          больше повторений
                        </div>
                      </div>

                      <div
                        className="
                          bg-white/5
                          border
                          border-white/10
                          rounded-2xl
                          px-5
                          py-4
                        "
                      >
                        <div className="text-4xl font-black text-[#8F5BFF]">
                          24/7
                        </div>

                        <div className="text-white/60 text-sm">
                          доступность
                        </div>
                      </div>

                      <div
                        className="
                          bg-white/5
                          border
                          border-white/10
                          rounded-2xl
                          px-5
                          py-4
                        "
                      >
                        <div className="text-4xl font-black text-[#8F5BFF]">
                          100%
                        </div>

                        <div className="text-white/60 text-sm">
                          времени на игру
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ROBOT */}

                  <div className="relative flex justify-center">
                    <div
                      className="
                        absolute
                        w-[450px]
                        h-[450px]
                        rounded-full
                        bg-[#8F5BFF]/20
                        blur-[140px]
                      "
                    />

                    <div
                      className="
                        relative
                        bg-white/5
                        border
                        border-white/10
                        rounded-[32px]
                        p-10
                        backdrop-blur-xl
                      "
                    >
                      <Image
                        src="/bot.png"
                        alt="PongLab Robot"
                        width={520}
                        height={520}
                        className="
                          object-contain
                          drop-shadow-[0_0_80px_rgba(143,91,255,.35)]
                        "
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* SECTION 2 */}

              <section
                className="
                  min-h-[88vh]
                  snap-start
                  px-8
                  md:px-14
                  py-16
                  flex
                  items-center
                "
              >
                <div className="w-full">
                  <div className="mb-12">
                    <h3
                      className="
                        text-4xl
                        md:text-6xl
                        font-black
                        text-white
                      "
                    >
                      Больше практики.
                      <br />
                      Меньше ожидания.
                    </h3>
                  </div>

                  <div className="grid lg:grid-cols-2 gap-8">
                    <div
                      className="
                        rounded-[28px]
                        border
                        border-white/10
                        bg-white/[0.04]
                        p-8
                      "
                    >
                      <div className="flex items-center gap-3 mb-6">
                        <Users
                          className="text-white"
                          size={24}
                        />

                        <span className="text-white text-xl font-semibold">
                          Обычная тренировка
                        </span>
                      </div>

                      <div className="space-y-4">
                        <div className="bg-white/5 rounded-xl p-4 text-white/70">
                          Подача
                        </div>

                        <div className="bg-white/5 rounded-xl p-4 text-white/40">
                          Пауза
                        </div>

                        <div className="bg-white/5 rounded-xl p-4 text-white/40">
                          Объяснение
                        </div>

                        <div className="bg-white/5 rounded-xl p-4 text-white/70">
                          Подача
                        </div>

                        <div className="bg-white/5 rounded-xl p-4 text-white/40">
                          Пауза
                        </div>
                      </div>
                    </div>

                    <div
                      className="
                        rounded-[28px]
                        border
                        border-[#8F5BFF]/30
                        bg-[#8F5BFF]/10
                        p-8
                      "
                    >
                      <div className="flex items-center gap-3 mb-6">
                        <Zap
                          className="text-[#BFA5FF]"
                          size={24}
                        />

                        <span className="text-white text-xl font-semibold">
                          PongLab
                        </span>
                      </div>

                      <div className="space-y-4">
                        <div className="bg-white/10 rounded-xl p-4 text-white">
                          Подача
                        </div>

                        <div className="bg-white/10 rounded-xl p-4 text-white">
                          Подача
                        </div>

                        <div className="bg-white/10 rounded-xl p-4 text-white">
                          Подача
                        </div>

                        <div className="bg-white/10 rounded-xl p-4 text-white">
                          Подача
                        </div>

                        <div className="bg-white/10 rounded-xl p-4 text-white">
                          Подача
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
              {/* SECTION 3 */}

              <section
                className="
                  min-h-[88vh]
                  snap-start
                  px-8
                  md:px-14
                  py-16
                  flex
                  items-center
                "
              >
                <div className="w-full">
                  <div className="mb-12">
                    <h3
                      className="
                        text-4xl
                        md:text-6xl
                        font-black
                        text-white
                      "
                    >
                      Отрабатывайте
                      <br />
                      именно то,
                      <br />
                      что хотите улучшить
                    </h3>

                    <p className="mt-6 text-white/70 text-lg max-w-2xl">
                      Робот способен повторять один и тот же
                      сценарий сотни раз подряд с одинаковой
                      точностью. Именно такая повторяемость
                      помогает быстрее закреплять технику.
                    </p>
                  </div>

                  <div className="grid lg:grid-cols-2 gap-10">
                    <div
                      className="
                        rounded-[32px]
                        border
                        border-white/10
                        bg-white/[0.04]
                        overflow-hidden
                        min-h-[420px]
                        relative
                      "
                    >
                      <div
                        className="
                          absolute
                          inset-0
                          bg-gradient-to-br
                          from-[#8F5BFF]/20
                          via-transparent
                          to-transparent
                        "
                      />

                      <div className="absolute inset-0 flex items-center justify-center">
                        <Image
                          src="/bot.png"
                          alt="robot"
                          width={380}
                          height={380}
                          className="
                            object-contain
                            opacity-90
                          "
                        />
                      </div>

                      <div className="absolute bottom-6 left-6">
                        <div
                          className="
                            bg-black/50
                            backdrop-blur
                            border
                            border-white/10
                            rounded-2xl
                            px-5
                            py-4
                          "
                        >
                          <div className="text-[#8F5BFF] text-4xl font-black">
                            1500+
                          </div>

                          <div className="text-white/60 text-sm">
                            ударов за тренировку
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-5">
                      <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-6">
                        <div className="flex justify-between mb-3">
                          <span className="text-white font-medium">
                            Форхенд
                          </span>

                          <Target
                            size={18}
                            className="text-[#8F5BFF]"
                          />
                        </div>

                        <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full w-[95%] bg-[#8F5BFF]" />
                        </div>
                      </div>

                      <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-6">
                        <div className="flex justify-between mb-3">
                          <span className="text-white font-medium">
                            Бэкхенд
                          </span>

                          <Target
                            size={18}
                            className="text-[#8F5BFF]"
                          />
                        </div>

                        <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full w-[88%] bg-[#8F5BFF]" />
                        </div>
                      </div>

                      <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-6">
                        <div className="flex justify-between mb-3">
                          <span className="text-white font-medium">
                            Приём подачи
                          </span>

                          <Target
                            size={18}
                            className="text-[#8F5BFF]"
                          />
                        </div>

                        <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full w-[82%] bg-[#8F5BFF]" />
                        </div>
                      </div>

                      <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-6">
                        <div className="flex justify-between mb-3">
                          <span className="text-white font-medium">
                            Работа ног
                          </span>

                          <Target
                            size={18}
                            className="text-[#8F5BFF]"
                          />
                        </div>

                        <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full w-[90%] bg-[#8F5BFF]" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* SECTION 4 */}

              <section
                className="
                  min-h-[88vh]
                  snap-start
                  px-8
                  md:px-14
                  py-16
                  flex
                  items-center
                "
              >
                <div className="w-full text-center">
                  <div
                    className="
                      inline-flex
                      items-center
                      justify-center
                      w-20
                      h-20
                      rounded-full
                      bg-[#8F5BFF]/10
                      border
                      border-[#8F5BFF]/30
                      mb-8
                    "
                  >
                    <Clock3
                      size={36}
                      className="text-[#8F5BFF]"
                    />
                  </div>

                  <h3
                    className="
                      text-5xl
                      md:text-7xl
                      font-black
                      text-white
                    "
                  >
                    Тренируйтесь
                    <br />
                    тогда,
                    <br />
                    когда удобно вам
                  </h3>

                  <p
                    className="
                      mt-8
                      max-w-3xl
                      mx-auto
                      text-lg
                      text-white/70
                    "
                  >
                    Не нужно подстраиваться под расписание
                    тренера или искать партнёра для игры.
                    Вы сами выбираете время тренировки и её
                    продолжительность.
                  </p>

                  <div
                    className="
                      mt-14
                      grid
                      grid-cols-2
                      lg:grid-cols-4
                      gap-6
                    "
                  >
                    {[
                      "Утро",
                      "День",
                      "Вечер",
                      "Выходные",
                    ].map((item) => (
                      <div
                        key={item}
                        className="
                          bg-white/[0.04]
                          border
                          border-white/10
                          rounded-3xl
                          py-10
                        "
                      >
                        <div className="text-3xl mb-2">
                          🕒
                        </div>

                        <div className="text-white font-semibold">
                          {item}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* SECTION 5 */}

              <section
                className="
                  min-h-[88vh]
                  snap-start
                  px-8
                  md:px-14
                  py-16
                  flex
                  items-center
                  justify-center
                "
              >
                <div className="text-center max-w-5xl">
                  <div
                    className="
                      text-[110px]
                      md:text-[220px]
                      font-black
                      leading-none
                      text-[#8F5BFF]
                    "
                  >
                    1000+
                  </div>

                  <h3
                    className="
                      text-4xl
                      md:text-6xl
                      font-black
                      text-white
                      mt-4
                    "
                  >
                    ударов за тренировку
                  </h3>

                  <p
                    className="
                      mt-8
                      text-lg
                      text-white/70
                      max-w-3xl
                      mx-auto
                    "
                  >
                    Чем больше качественных повторений,
                    тем быстрее формируется стабильный
                    игровой навык.
                  </p>
                </div>
              </section>
              {/* SECTION 6 */}

              <section
                className="
                  min-h-[88vh]
                  snap-start
                  px-8
                  md:px-14
                  py-16
                  flex
                  items-center
                "
              >
                <div className="w-full">
                  <div className="text-center mb-16">
                    <h3
                      className="
                        text-5xl
                        md:text-6xl
                        font-black
                        text-white
                      "
                    >
                      PongLab —
                      <br />
                      больше чем робот
                    </h3>

                    <p
                      className="
                        mt-6
                        text-white/70
                        text-lg
                        max-w-3xl
                        mx-auto
                      "
                    >
                      Мы строим полноценную платформу для
                      самостоятельного развития игроков.
                    </p>
                  </div>

                  <div className="grid lg:grid-cols-4 gap-6">
                    <div
                      className="
                        rounded-3xl
                        bg-white/[0.04]
                        border
                        border-white/10
                        p-8
                      "
                    >
                      <BarChart3
                        className="text-[#8F5BFF] mb-5"
                        size={34}
                      />

                      <h4 className="text-white font-bold text-xl mb-3">
                        Статистика
                      </h4>

                      <p className="text-white/60">
                        Отслеживайте свою активность,
                        количество тренировок и прогресс.
                      </p>
                    </div>

                    <div
                      className="
                        rounded-3xl
                        bg-white/[0.04]
                        border
                        border-white/10
                        p-8
                      "
                    >
                      <Brain
                        className="text-[#8F5BFF] mb-5"
                        size={34}
                      />

                      <h4 className="text-white font-bold text-xl mb-3">
                        Индивидуальные режимы
                      </h4>

                      <p className="text-white/60">
                        Создавайте собственные сценарии
                        подачи под ваши цели.
                      </p>
                    </div>

                    <div
                      className="
                        rounded-3xl
                        bg-white/[0.04]
                        border
                        border-white/10
                        p-8
                      "
                    >
                      <Trophy
                        className="text-[#8F5BFF] mb-5"
                        size={34}
                      />

                      <h4 className="text-white font-bold text-xl mb-3">
                        Турниры
                      </h4>

                      <p className="text-white/60">
                        Соревнуйтесь с другими игроками и
                        проверяйте свой уровень.
                      </p>
                    </div>

                    <div
                      className="
                        rounded-3xl
                        bg-white/[0.04]
                        border
                        border-white/10
                        p-8
                      "
                    >
                      <Zap
                        className="text-[#8F5BFF] mb-5"
                        size={34}
                      />

                      <h4 className="text-white font-bold text-xl mb-3">
                        Аналитика
                      </h4>

                      <p className="text-white/60">
                        Видьте результаты своей работы и
                        понимайте куда двигаться дальше.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* SECTION 7 */}

              <section
                className="
                  min-h-[90vh]
                  snap-start
                  px-8
                  md:px-14
                  py-16
                  flex
                  items-center
                "
              >
                <div className="w-full">
                  <div className="text-center mb-16">
                    <h3
                      className="
                        text-5xl
                        md:text-6xl
                        font-black
                        text-white
                      "
                    >
                      PongLab и тренер
                      <br />
                      не конкурируют
                    </h3>

                    <p
                      className="
                        mt-6
                        text-white/70
                        text-lg
                        max-w-3xl
                        mx-auto
                      "
                    >
                      Лучший результат достигается при
                      сочетании самостоятельных тренировок
                      и занятий с тренером.
                    </p>
                  </div>

                  <div
                    className="
                      overflow-hidden
                      rounded-[32px]
                      border
                      border-white/10
                    "
                  >
                    <table className="w-full">
                      <thead>
                        <tr className="bg-white/[0.04]">
                          <th className="text-left p-6 text-white">
                            Задача
                          </th>

                          <th className="p-6 text-[#8F5BFF]">
                            PongLab
                          </th>

                          <th className="p-6 text-white">
                            Тренер
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {[
                          [
                            "Большое количество повторений",
                            "✓",
                            "Частично",
                          ],
                          [
                            "Отработка одного элемента",
                            "✓",
                            "✓",
                          ],
                          [
                            "Тактический разбор",
                            "—",
                            "✓",
                          ],
                          [
                            "Исправление техники",
                            "—",
                            "✓",
                          ],
                          [
                            "Самостоятельные тренировки",
                            "✓",
                            "—",
                          ],
                          [
                            "Гибкий график",
                            "✓",
                            "Частично",
                          ],
                        ].map((row) => (
                          <tr
                            key={row[0]}
                            className="border-t border-white/10"
                          >
                            <td className="p-6 text-white/80">
                              {row[0]}
                            </td>

                            <td className="p-6 text-center text-[#8F5BFF] font-bold">
                              {row[1]}
                            </td>

                            <td className="p-6 text-center text-white/70">
                              {row[2]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              {/* SECTION 8 */}

              <section
                className="
                  min-h-[90vh]
                  snap-start
                  px-8
                  md:px-14
                  py-16
                  flex
                  items-center
                "
              >
                <div
                  className="
                    w-full
                    rounded-[40px]
                    border
                    border-[#8F5BFF]/20
                    bg-gradient-to-br
                    from-[#8F5BFF]/15
                    to-transparent
                    p-10
                    md:p-20
                  "
                >
                  <div className="grid lg:grid-cols-2 gap-10 items-center">
                    <div>
                      <h3
                        className="
                          text-5xl
                          md:text-7xl
                          font-black
                          text-white
                          leading-none
                        "
                      >
                        Каждая
                        <br />
                        тренировка
                        <br />
                        приближает
                        <br />
                        вас к
                        <br />
                        следующему
                        <br />
                        уровню
                      </h3>

                      <p
                        className="
                          mt-8
                          text-white/70
                          text-lg
                          max-w-xl
                        "
                      >
                        Тренируйтесь тогда, когда удобно.
                        Работайте над тем, что действительно
                        важно. Получайте больше качественной
                        практики за каждую минуту у стола.
                      </p>
                    </div>

                    <div className="flex flex-col items-center justify-center">
                      <Image
                        src="/bot.png"
                        alt="robot"
                        width={420}
                        height={420}
                        className="object-contain"
                      />

                      <button
                        onClick={onClose}
                        className="
                          mt-8
                          inline-flex
                          items-center
                          gap-3
                          px-8
                          py-5
                          rounded-2xl
                          bg-[#8F5BFF]
                          hover:bg-[#9a6cff]
                          text-white
                          font-semibold
                          transition
                        "
                      >
                        Выбрать тариф

                        <ArrowRight size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </section>

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}