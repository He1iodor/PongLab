"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

const navItems = [
  {
    title: "Как работает",
    id: "how-it-works",
  },
  {
    title: "Эффективнее",
    id: "why-better",
  },
  {
    title: "Тарифы",
    id: "pricing",
  },
  {
    title: "Аналитика",
    id: "analytics",
  },
  {
    title: "FAQ",
    id: "faq",
  },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const scrollToSection = (id: string) => {
    const section = document.getElementById(id);

    if (!section) return;

    section.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  useEffect(() => {
    const handler = () => {
      setScrolled(window.scrollY > 40);
    };

    window.addEventListener("scroll", handler);

    return () => {
      window.removeEventListener("scroll", handler);
    };
  }, []);

  return (
    <>
      <header
        className="
        fixed
        top-0
        left-0
        right-0
        z-50
        flex
        justify-center
        pt-6
        "
      >
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
              py-3
              px-6
              bg-[rgba(10,12,24,.82)]
              border-white/10
              backdrop-blur-2xl
              shadow-[0_10px_60px_rgba(107,48,206,.25)]
              `
              : `
              py-4
              px-8
              bg-[rgba(10,12,24,.45)]
              border-white/5
              backdrop-blur-xl
              shadow-[0_10px_40px_rgba(0,0,0,.35)]
              `
          }
          `}
        >
          <button
            onClick={() =>
              window.scrollTo({
                top: 0,
                behavior: "smooth",
              })
            }
          >
            <div className="flex items-center gap-3 cursor-pointer">
              <Image
                src="/logotext.png"
                alt="PongLab"
                width={200}
                height={60}
                priority
              />
            </div>
          </button>

          <nav
            className="
            hidden
            lg:flex
            items-center
            gap-10
            "
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className="
                relative
                group
                text-sm
                text-white/70
                transition-all
                duration-300
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
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <div
              className="
              hidden
              xl:flex
              items-center
              gap-2
              "
            >
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
              hidden
              md:flex
              relative
              overflow-hidden
              items-center
              justify-center
              rounded-[18px]
              px-6
              py-3
              font-semibold
              bg-gradient-to-r
              from-[#6B30CE]
              to-[#8F5BFF]
              transition-all
              duration-300
              hover:scale-105
              hover:shadow-[0_0_40px_rgba(107,48,206,.55)]
              "
            >
              <span className="relative z-10">
                Начать бесплатно
              </span>
            </button>

            <button
              onClick={() => setMobileOpen(true)}
              className="
              lg:hidden
              flex
              items-center
              justify-center
              h-11
              w-11
              rounded-xl
              bg-white/5
              border
              border-white/10
              "
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div
          className="
          fixed
          inset-0
          z-[100]
          bg-[#090B18]
          flex
          flex-col
          "
        >
          <div
            className="
            flex
            justify-between
            items-center
            p-6
            "
          >
            <div className="font-black text-xl">
              PONGLAB
            </div>

            <button
              onClick={() => setMobileOpen(false)}
              className="
              h-11
              w-11
              rounded-xl
              bg-white/5
              "
            >
              <X size={22} />
            </button>
          </div>

          <div
            className="
            flex
            flex-col
            gap-8
            p-8
            text-2xl
            "
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  scrollToSection(item.id);
                  setMobileOpen(false);
                }}
                className="
                text-left
                text-2xl
                text-white/80
                hover:text-[#8F5BFF]
                transition-all
                duration-300
                "
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
