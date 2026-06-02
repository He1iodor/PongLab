"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const navItems = [
  {
    title: "Как работает",
    href: "/how-it-works",
  },
  {
    title: "Почему эффективнее",
    href: "/why-effective",
  },
  {
    title: "Тарифы",
    href: "/pricing",
  },
  {
    title: "Аналитика",
    href: "/analytics",
  },
  {
    title: "FAQ",
    href: "/faq",
  },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => {
      setScrolled(window.scrollY > 30);
    };

    window.addEventListener("scroll", handler);

    return () => {
      window.removeEventListener("scroll", handler);
    };
  }, []);

  return (
    <header
      className={`
      fixed
      top-0
      left-0
      right-0
      z-50
      flex
      justify-center
      pt-6
      transition-all
      duration-500
      `}
    >
      <div
        className={`
        w-[92%]
        max-w-[1400px]
        flex
        items-center
        justify-between
        rounded-[24px]
        border
        transition-all
        duration-500
        
        ${
          scrolled
            ? `
            bg-[rgba(15,18,35,.75)]
            backdrop-blur-xl
            border-white/10
            shadow-[0_0_50px_rgba(107,48,206,.12)]
            py-3
            px-6
            `
            : `
            bg-[rgba(15,18,35,.35)]
            backdrop-blur-md
            border-white/5
            py-4
            px-8
            `
        }
      `}
      >
        <Link href="/">
          <div className="flex flex-col">
            <span className="font-black text-xl tracking-tight">
              PONGLAB
            </span>

            <span className="text-[10px] tracking-[3px] text-white/50">
              SMART TRAINING
            </span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="
              text-sm
              text-white/70
              transition-all
              duration-300
              hover:text-white
              hover:translate-y-[-2px]
              "
            >
              {item.title}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-2">
            <div
              className="
              h-2.5
              w-2.5
              rounded-full
              bg-green-400
              animate-pulse
              "
            />

            <span className="text-xs text-white/60">
              Система онлайн
            </span>
          </div>

          <button
            className="
            rounded-[16px]
            px-5
            py-3
            font-semibold
            transition-all
            duration-300

            bg-gradient-to-r
            from-[#6B30CE]
            to-[#8F5BFF]

            hover:scale-105
            hover:shadow-[0_0_35px_rgba(107,48,206,.55)]
            "
          >
            Попробовать
          </button>
        </div>
      </div>
    </header>
  );
}