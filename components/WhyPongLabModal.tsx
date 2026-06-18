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
  Zap,
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

  const backdropRef = useRef(null);

  const handleBackdropClick = (
    e: React.MouseEvent
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

    window.addEventListener(
      "keydown",
      handleEsc
    );

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
            duration: 0.35,
          }}
          className="
            fixed
            inset-0
            z-[9999]
            bg-black/80
            backdrop-blur-xl
            flex
            items-center
            justify-center
            p-2
            md:p-4
          "
        >
          <motion.div
            initial={{
              opacity: 0,
              scale: 0.97,
              y: 40,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              scale: 0.97,
              y: 20,
            }}
            transition={{
              duration: 0.45,
              ease: "easeOut",
            }}
            className="
              relative
              w-[96vw]
              h-[95vh]
              overflow-hidden
              rounded-[38px]
              border
              border-white/10
              bg-[#090B18]
              shadow-[0_50px_120px_rgba(0,0,0,.75)]
            "
          >
            {/* background glow */}

            <div
              className="
                absolute
                -top-[250px]
                -right-[250px]
                w-[700px]
                h-[700px]
                rounded-full
                bg-[#8F5BFF]/20
                blur-[180px]
                pointer-events-none
              "
            />

            <div
              className="
                absolute
                -bottom-[300px]
                -left-[300px]
                w-[800px]
                h-[800px]
                rounded-full
                bg-[#6B30CE]/20
                blur-[220px]
                pointer-events-none
              "
            />

            {/* close */}

            <button
              onClick={onClose}
              className="
                absolute
                top-6
                right-6
                z-50
                h-12
                w-12
                rounded-2xl
                border
                border-white/10
                bg-white/5
                backdrop-blur
                flex
                items-center
                justify-center
                hover:bg-white/10
                transition
              "
            >
              <X size={20} />
            </button>

            {/* scroll */}

            <div
              className="
                h-full
                overflow-y-auto
                no-scrollbar
                scroll-smooth
                snap-y
                snap-mandatory
              "
            >
              {/* HERO SCREEN */}

              <section
                className="
                  relative
                  min-h-[95vh]
                  snap-start
                  flex
                  items-center
                  px-8
                  md:px-20
                "
              >
                <div
                  className="
                    grid
                    lg:grid-cols-2
                    gap-10
                    items-center
                    w-full
                  "
                >
                  {/* left */}

                  <div>
                    <motion.div
                      initial={{
                        opacity: 0,
                        y: 30,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      transition={{
                        delay: 0.15,
                      }}
                      className="
                        inline-flex
                        items-center
                        gap-2
                        px-5
                        py-3
                        rounded-full
                        border
                        border-[#8F5BFF]/30
                        bg-[#8F5BFF]/10
                        text-[#CDB8FF]
                        mb-8
                      "
                    >
                      <Zap size={16} />

                      Почему игроки выбирают PongLab
                    </motion.div>

                    <motion.h1
                      initial={{
                        opacity: 0,
                        y: 30,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      transition={{
                        delay: 0.25,
                      }}
                      className="
                        text-6xl
                        md:text-8xl
                        font-black
                        leading-[0.9]
                        tracking-[-0.04em]
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
                    </motion.h1>

                    <motion.p
                      initial={{
                        opacity: 0,
                        y: 30,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      transition={{
                        delay: 0.35,
                      }}
                      className="
                        mt-8
                        max-w-xl
                        text-xl
                        text-white/65
                        leading-relaxed
                      "
                    >
                      До 10 раз больше игровых
                      повторений за тренировку.
                      Максимум практики.
                      Максимум контроля.
                      Максимум прогресса.
                    </motion.p>

                    <motion.div
                      initial={{
                        opacity: 0,
                        y: 30,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      transition={{
                        delay: 0.45,
                      }}
                      className="
                        mt-10
                        flex
                        items-center
                        gap-4
                      "
                    >
                      <button
                        className="
                          px-8
                          py-5
                          rounded-2xl
                          bg-gradient-to-r
                          from-[#6B30CE]
                          to-[#8F5BFF]
                          font-semibold
                          hover:scale-105
                          transition-all
                        "
                      >
                        Узнать больше
                      </button>
                    </motion.div>
                  </div>

                  {/* robot */}

                  <div
                    className="
                      relative
                      flex
                      justify-center
                      items-center
                    "
                  >
                    <div
                      className="
                        absolute
                        w-[600px]
                        h-[600px]
                        rounded-full
                        bg-[#8F5BFF]/20
                        blur-[160px]
                      "
                    />

                    <Image
                      src="/bot.png"
                      alt="PongLab Robot"
                      width={820}
                      height={820}
                      className="
                        relative
                        z-10
                        object-contain
                        drop-shadow-[0_0_120px_rgba(143,91,255,.35)]
                      "
                    />
                  </div>
                </div>
                
  {/* SECTION 2 */}

<section
  className="
    min-h-[95vh]
    snap-start
    flex
    items-center
    justify-center
    px-8
    md:px-20
    relative
  "
>
  <div className="text-center max-w-6xl">

    <div
      className="
        text-[140px]
        md:text-[320px]
        font-black
        leading-none
        tracking-[-0.08em]
        text-[#8F5BFF]
      "
    >
      10x
    </div>

    <h2
      className="
        text-4xl
        md:text-7xl
        font-black
        leading-[0.95]
        mt-2
      "
    >
      Больше игровых
      <br />
      повторений
    </h2>

    <p
      className="
        mt-10
        text-xl
        text-white/65
        max-w-3xl
        mx-auto
      "
    >
      Пока обычная тренировка тратит время
      на ожидание и паузы,
      PongLab позволяет концентрироваться
      исключительно на практике.
    </p>

  </div>
</section>

{/* SECTION 3 */}

<section
  className="
    min-h-[95vh]
    snap-start
    flex
    items-center
    px-8
    md:px-20
  "
>
  <div
    className="
      grid
      lg:grid-cols-2
      gap-20
      items-center
      w-full
    "
  >

    {/* IMAGE */}

    <div className="relative">

      <div
        className="
          absolute
          inset-0
          rounded-[40px]
          bg-[#8F5BFF]/10
          blur-[100px]
        "
      />

      <div
        className="
          relative
          rounded-[40px]
          border
          border-white/10
          bg-white/[0.04]
          overflow-hidden
          p-10
        "
      >
        <Image
          src="/bot.png"
          alt="PongLab"
          width={700}
          height={700}
          className="
            mx-auto
            object-contain
          "
        />
      </div>

    </div>

    {/* TEXT */}

    <div>

      <div
        className="
          text-[#8F5BFF]
          uppercase
          tracking-[0.25em]
          text-sm
          mb-6
        "
      >
        Точность
      </div>

      <h2
        className="
          text-5xl
          md:text-7xl
          font-black
          leading-[0.95]
        "
      >
        Отрабатывайте
        <br />
        именно то,
        <br />
        что хотите
        <br />
        улучшить
      </h2>

      <p
        className="
          mt-10
          text-xl
          text-white/65
          max-w-xl
          leading-relaxed
        "
      >
        Робот способен повторять один и тот же
        сценарий сотни раз подряд
        с одинаковой точностью.

        Именно такая повторяемость
        помогает быстрее закреплять технику.
      </p>

    </div>

  </div>
</section>

{/* SECTION 4 */}

<section
  className="
    min-h-[95vh]
    snap-start
    flex
    items-center
    justify-center
    px-8
  "
>
  <div className="text-center">

    <div
      className="
        text-[120px]
        md:text-[260px]
        font-black
        leading-none
        tracking-[-0.08em]
        text-white
      "
    >
      1000+
    </div>

    <h2
      className="
        text-4xl
        md:text-7xl
        font-black
        mt-4
      "
    >
      ударов
      <br />
      за тренировку
    </h2>

    <p
      className="
        mt-10
        text-xl
        text-white/65
        max-w-3xl
        mx-auto
      "
    >
      Чем больше качественных повторений,
      тем быстрее формируется
      стабильный игровой навык.
    </p>

  </div>
</section>

{/* SECTION 5 */}

<section
  className="
    min-h-[95vh]
    snap-start
    flex
    items-center
    px-8
    md:px-20
  "
>
  <div className="w-full">

    <div className="text-center mb-20">

      <h2
        className="
          text-5xl
          md:text-7xl
          font-black
          leading-[0.95]
        "
      >
        Почему игроки
        <br />
        прогрессируют быстрее
      </h2>

    </div>

    <div
      className="
        grid
        lg:grid-cols-2
        gap-10
      "
    >

      {/* LEFT */}

      <div
        className="
          rounded-[40px]
          border
          border-white/10
          bg-white/[0.04]
          p-10
        "
      >
        <div
          className="
            text-white/50
            text-sm
            uppercase
            tracking-[0.2em]
            mb-6
          "
        >
          Обычные тренировки
        </div>

        <h3
          className="
            text-3xl
            font-bold
            mb-8
          "
        >
          Большая часть времени
          уходит не на игру
        </h3>

        <div className="space-y-5 text-white/60">

          <div>• ожидание подачи</div>

          <div>• сбор мячей</div>

          <div>• паузы между упражнениями</div>

          <div>• ограниченное количество повторений</div>

          <div>• зависимость от партнёра</div>

        </div>

      </div>

      {/* RIGHT */}

      <div
        className="
          rounded-[40px]
          border
          border-[#8F5BFF]/30
          bg-[#8F5BFF]/10
          p-10
        "
      >
        <div
          className="
            text-[#CDB8FF]
            text-sm
            uppercase
            tracking-[0.2em]
            mb-6
          "
        >
          PongLab
        </div>

        <h3
          className="
            text-3xl
            font-bold
            mb-8
          "
        >
          Почти всё время
          занимает практика
        </h3>

        <div className="space-y-5">

          <div>✓ непрерывная подача</div>

          <div>✓ максимум повторений</div>

          <div>✓ стабильная траектория</div>

          <div>✓ тренировка без партнёра</div>

          <div>✓ полный контроль нагрузки</div>

        </div>

      </div>

    </div>

  </div>
</section>

{/* SECTION 6 */}

<section
  className="
    min-h-[95vh]
    snap-start
    flex
    items-center
    px-8
    md:px-20
  "
>
  <div
    className="
      grid
      lg:grid-cols-2
      gap-20
      items-center
      w-full
    "
  >

    <div>

      <div
        className="
          text-[#8F5BFF]
          uppercase
          tracking-[0.25em]
          text-sm
          mb-6
        "
      >
        Аналитика
      </div>

      <h2
        className="
          text-5xl
          md:text-7xl
          font-black
          leading-[0.95]
        "
      >
        Каждая
        <br />
        тренировка
        <br />
        оставляет
        <br />
        данные
      </h2>

      <p
        className="
          mt-10
          text-xl
          text-white/65
          max-w-xl
        "
      >
        Следите за количеством тренировок,
        ударами,
        прогрессом
        и личной статистикой.
      </p>

    </div>

    <div>

      <div
        className="
          rounded-[40px]
          border
          border-white/10
          bg-white/[0.04]
          p-10
        "
      >

        <div className="mb-10">

          <div className="text-white/60 mb-2">
            Активность
          </div>

          <div className="text-5xl font-black">
            92%
          </div>

        </div>

        <div className="space-y-6">

          <div>
            <div className="flex justify-between mb-2">
              <span>Форхенд</span>
              <span>95%</span>
            </div>

            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full w-[95%] bg-[#8F5BFF]" />
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <span>Бэкхенд</span>
              <span>88%</span>
            </div>

            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full w-[88%] bg-[#8F5BFF]" />
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <span>Приём подачи</span>
              <span>82%</span>
            </div>

            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full w-[82%] bg-[#8F5BFF]" />
            </div>
          </div>

        </div>

      </div>

    </div>

  </div>
</section>

{/* SECTION 7 */}

<section
  className="
    min-h-[95vh]
    snap-start
    flex
    items-center
    justify-center
    px-8
    md:px-20
  "
>
  <div
    className="
      text-center
      max-w-6xl
    "
  >

    <Image
      src="/logo.png"
      alt="PongLab"
      width={140}
      height={140}
      className="mx-auto mb-10"
    />

    <h2
      className="
        text-5xl
        md:text-8xl
        font-black
        leading-[0.9]
      "
    >
      Каждая
      <br />
      тренировка
      <br />
      приближает
      <br />
      вас к новому
      <br />
      уровню
    </h2>

    <p
      className="
        mt-10
        text-xl
        text-white/65
        max-w-3xl
        mx-auto
      "
    >
      Больше повторений.
      Больше контроля.
      Больше прогресса.
    </p>

  </div>
</section>

{/* SECTION 8 */}

<section
  className="
    min-h-[95vh]
    snap-start
    flex
    items-center
    px-8
    md:px-20
  "
>
  <div
    className="
      w-full
      grid
      lg:grid-cols-2
      gap-20
      items-center
    "
  >

    <div>

      <h2
        className="
          text-5xl
          md:text-7xl
          font-black
          leading-[0.95]
        "
      >
        Готовы
        <br />
        начать
        <br />
        тренироваться
        <br />
        по-новому?
      </h2>

      <button
        onClick={onClose}
        className="
          mt-10
          inline-flex
          items-center
          gap-3
          px-8
          py-5
          rounded-2xl
          bg-gradient-to-r
          from-[#6B30CE]
          to-[#8F5BFF]
          font-semibold
          hover:scale-105
          transition-all
        "
      >
        Выбрать тариф

        <ArrowRight size={18} />
      </button>

    </div>

    <div className="relative">

      <div
        className="
          absolute
          w-[600px]
          h-[600px]
          rounded-full
          bg-[#8F5BFF]/20
          blur-[180px]
        "
      />

      <Image
        src="/bot.png"
        alt="PongLab Robot"
        width={850}
        height={850}
        className="
          relative
          z-10
          object-contain
        "
      />

    </div>
  </div>
</section>
