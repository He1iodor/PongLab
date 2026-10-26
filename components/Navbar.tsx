
"use client";

import Link from "next/link";
import Image from "next/image";
import PersonalAccountModal from "@/components/PersonalAccountModal";
import HowItWorksModal from "@/components/HowItWorksModal";
import WhyPongLabModal from "@/components/WhyPongLabModal";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

const navItems = [
  { title: "Принцип работы", href: "/how-it-works" },
  { title: "Эффективность", href: "/why-effective" },
  { title: "Тарифы", href: "/pricing" },
  { title: "Аналитика", href: "/analytics" },
  { title: "FAQ", href: "/faq" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => {
      setScrolled(window.scrollY > 40);
    };

    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const openAccount = () => {
    setMobileOpen(false);
    setAccountOpen(true);
  };

  return (
    <>
      <header className="fixed top-0 left-0 z-50 flex w-full justify-center">
        <div
          className={`
            flex w-[94%] max-w-[1450px]
            items-center justify-between
            rounded-[30px] border
            transition-all duration-500
            ${
              scrolled
                ? `
                  px-4 py-3 sm:px-6
                  border-white/10
                  bg-[rgba(10,12,24,.82)]
                  backdrop-blur-2xl
                  shadow-[0_10px_60px_rgba(107,48,206,.25)]
                `
                : `
                  px-4 py-4 sm:px-8
                  border-white/5
                  bg-[rgba(10,12,24,.45)]
                  backdrop-blur-xl
                  shadow-[0_10px_40px_rgba(0,0,0,.35)]
                `
            }
          `}
        >
          {/* Логотип */}
          <Link
            href="/"
            aria-label="PongLab — главная"
            onClick={() => setMobileOpen(false)}
            className="shrink-0"
          >
            <Image
              src="/logotext.png"
              alt="PongLab"
              width={200}
              height={60}
              priority
              className="h-auto w-[130px] sm:w-[160px] lg:w-[200px]"
            />
          </Link>

          {/* Навигация на компьютере */}
          <nav className="hidden items-center gap-10 lg:flex">
            {navItems.map((item) => {
              if (item.href === "/how-it-works") {
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => setHowItWorksOpen(true)}
                    className="
                      relative text-sm text-white/70
                      transition-all duration-300 hover:text-white
                      group
                    "
                  >
                    {item.title}
                    <span className="absolute -bottom-2 left-0 h-[2px] w-0 bg-[#8F5BFF] transition-all duration-300 group-hover:w-full" />
                  </button>
                );
              }

              if (item.href === "/why-effective") {
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => setWhyOpen(true)}
                    className="
                      relative text-sm text-white/70
                      transition-all duration-300 hover:text-white
                      group
                    "
                  >
                    {item.title}
                    <span className="absolute -bottom-2 left-0 h-[2px] w-0 bg-[#8F5BFF] transition-all duration-300 group-hover:w-full" />
                  </button>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="
                    relative text-sm text-white/70
                    transition-all duration-300 hover:text-white
                    group
                  "
                >
                  {item.title}
                  <span className="absolute -bottom-2 left-0 h-[2px] w-0 bg-[#8F5BFF] transition-all duration-300 group-hover:w-full" />
                </Link>
              );
            })}
          </nav>

          {/* Правая часть шапки */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <div className="hidden items-center gap-2 xl:flex">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-400" />
              <span className="text-xs text-white/60">
                Система онлайн
              </span>
            </div>

            {/* Кнопка личного кабинета на компьютере */}
            <button
              type="button"
              onClick={openAccount}
              className="
                hidden md:flex
                relative items-center justify-center
                overflow-hidden rounded-[18px]
                bg-gradient-to-r from-[#6B30CE] to-[#8F5BFF]
                px-4 py-3 font-semibold
                transition-all duration-300
                hover:scale-105
                hover:shadow-[0_0_40px_rgba(107,48,206,.55)]
                lg:px-6
              "
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-all duration-700 hover:translate-x-full" />
              <span className="relative z-10">Личный кабинет</span>
            </button>

            {/* Кнопка меню на планшете и телефоне */}
            <button
              type="button"
              aria-label="Открыть меню"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
              className="
                flex h-11 w-11 items-center justify-center
                rounded-xl border border-white/10
                bg-white/5 lg:hidden
              "
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      {/* Мобильное меню */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-[#090B18] text-white">
          <div className="flex items-center justify-between p-5 sm:p-6">
            <Link
              href="/"
              onClick={() => setMobileOpen(false)}
              aria-label="PongLab — главная"
            >
              <Image
                src="/logotext.png"
                alt="PongLab"
                width={160}
                height={48}
                className="h-auto w-[140px]"
              />
            </Link>

            <button
              type="button"
              aria-label="Закрыть меню"
              onClick={() => setMobileOpen(false)}
              className="
                flex h-11 w-11 items-center justify-center
                rounded-xl border border-white/10 bg-white/5
              "
            >
              <X size={22} />
            </button>
          </div>

          <nav className="flex flex-col gap-7 px-6 pb-10 pt-5 text-xl sm:px-8">
            {navItems.map((item) => {
              if (item.href === "/how-it-works") {
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      setHowItWorksOpen(true);
                    }}
                    className="text-left text-white/75 transition hover:text-white"
                  >
                    {item.title}
                  </button>
                );
              }

              if (item.href === "/why-effective") {
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      setWhyOpen(true);
                    }}
                    className="text-left text-white/75 transition hover:text-white"
                  >
                    {item.title}
                  </button>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-white/75 transition hover:text-white"
                >
                  {item.title}
                </Link>
              );
            })}

            {/* Личный кабинет в мобильном меню */}
            <div className="my-2 h-px w-full bg-white/10" />

            <button
              type="button"
              onClick={openAccount}
              className="
                w-full rounded-2xl
                bg-gradient-to-r from-[#6B30CE] to-[#8F5BFF]
                px-6 py-4 text-left text-lg font-semibold text-white
                shadow-[0_0_30px_rgba(107,48,206,.2)]
                transition-all duration-300
                hover:shadow-[0_0_40px_rgba(107,48,206,.45)]
                active:scale-[0.98]
              "
            >
              Личный кабинет
            </button>
          </nav>
        </div>
      )}

      {/* Модальные окна */}
      <HowItWorksModal
        open={howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
      />

      <PersonalAccountModal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
      />

      <WhyPongLabModal
        open={whyOpen}
        onClose={() => setWhyOpen(false)}
      />
    </>
  );
}
