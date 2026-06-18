"use client";

import Link from "next/link";
import Image from "next/image";
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

  return (
    <>
      <header className="fixed top-0 left-0 w-full flex justify-center z-50">
        <div
          className={`
            w-[94%]
            max-w-[1450px]
            flex
            items-center
            justify-between
            transition-all
            duration-500
            rounded-[30px]
            border

            ${
              scrolled
                ? `
                  py-3 px-6
                  bg-[rgba(10,12,24,.82)]
                  border-white/10
                  backdrop-blur-2xl
                  shadow-[0_10px_60px_rgba(107,48,206,.25)]
                `
                : `
                  py-4 px-8
                  bg-[rgba(10,12,24,.45)]
                  border-white/5
                  backdrop-blur-xl
                  shadow-[0_10px_40px_rgba(0,0,0,.35)]
                `
            }
          `}
        >
          {/* Logo */}
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer">
              <Image
                src="/logotext.png"
                alt="PongLab"
                width={200}
                height={60}
                priority
              />
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-10">
            {navItems.map((item) => {
              if (item.href === "/how-it-works") {
                return (
                  <button
                    key={item.href}
                    onClick={() => setHowItWorksOpen(true)}
                    className="
                      relative group
                      text-sm text-white/70
                      transition-all duration-300
                      hover:text-white
                    "
                  >
                    {item.title}
                    <span className="absolute left-0 -bottom-2 h-[2px] w-0 bg-[#8F5BFF] transition-all duration-300 group-hover:w-full" />
                  </button>
                );
              }
if (item.href === "/why-effective") {
  return (
    <button
      key={item.href}
      onClick={() => setWhyOpen(true)}
      className="
        relative group
        text-sm text-white/70
        transition-all duration-300
        hover:text-white
      "
    >
      {item.title}

      <span
        className="
          absolute
          left-0
          -bottom-2
          h-[2px]
          w-0
          bg-[#8F5BFF]
          transition-all
          duration-300
          group-hover:w-full
        "
      />
    </button>
  );
}
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="
                    relative group
                    text-sm text-white/70
                    transition-all duration-300
                    hover:text-white
                  "
                >
                  {item.title}
                  <span className="absolute left-0 -bottom-2 h-[2px] w-0 bg-[#8F5BFF] transition-all duration-300 group-hover:w-full" />
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-4">
            <div className="hidden xl:flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-white/60">Система онлайн</span>
            </div>

            <button
              className="
                hidden md:flex
                relative overflow-hidden
                items-center justify-center
                rounded-[18px]
                px-6 py-3
                font-semibold
                bg-gradient-to-r
                from-[#6B30CE] to-[#8F5BFF]
                transition-all duration-300
                hover:scale-105
                hover:shadow-[0_0_40px_rgba(107,48,206,.55)]
              "
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full hover:translate-x-full transition-all duration-700" />
              <span className="relative z-10">Личный кабинет</span>
            </button>

            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden flex items-center justify-center h-11 w-11 rounded-xl bg-white/5 border border-white/10"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] bg-[#090B18] flex flex-col">
          <div className="flex justify-between items-center p-6">
            <div className="font-black text-xl">PONGLAB</div>

            <button
              onClick={() => setMobileOpen(false)}
              className="h-11 w-11 rounded-xl bg-white/5 flex items-center justify-center"
            >
              <X size={22} />
            </button>
          </div>

          <div className="flex flex-col gap-8 p-8 text-2xl">
            {navItems.map((item) => {
              if (item.href === "/how-it-works") {
                return (
                  <button
                    key={item.href}
                    onClick={() => {
                      setHowItWorksOpen(true);
                      setMobileOpen(false);
                    }}
                    className="text-left text-white/70 hover:text-white transition"
                  >
                    {item.title}
                  </button>
                );
              }
if (item.href === "/why-effective") {
  return (
    <button
      key={item.href}
      onClick={() => {
        setWhyOpen(true);
        setMobileOpen(false);
      }}
      className="
        text-left
        text-white/70
        hover:text-white
        transition
      "
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
                  className="text-white/70 hover:text-white transition"
                >
                  {item.title}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal */}
      <HowItWorksModal
        open={howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
      />
      <WhyPongLabModal
  open={whyOpen}
  onClose={() => setWhyOpen(false)}
/>
    </>
  );
}
