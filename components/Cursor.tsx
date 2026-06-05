"use client";

import { useEffect, useState } from "react";

export default function Cursor() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let mouseX = 0;
    let mouseY = 0;
    let currentX = 0;
    let currentY = 0;

    const move = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      setVisible(true);
    };

    const checkHover = () => {
      const el = document.elementFromPoint(mouseX, mouseY);

      if (!el) return;

      const interactive = el.closest(
        "a, button, input, textarea, select"
      );

      setHover(!!interactive);
    };

    const animate = () => {
      currentX += (mouseX - currentX) * 0.15;
      currentY += (mouseY - currentY) * 0.15;

      setPos({ x: currentX, y: currentY });

      checkHover();
      requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", move);
    animate();

    return () => {
      window.removeEventListener("mousemove", move);
    };
  }, []);

  return (
    <div
      className={`
        fixed top-0 left-0 z-[9999]
        pointer-events-none
        transition-transform duration-150
      `}
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px)`,
      }}
    >
      {/* MAIN DOT */}
      <div
        className={`
          rounded-full
          transition-all duration-200
          ${
            hover
              ? "w-10 h-10 bg-[#8F5BFF]/20"
              : "w-4 h-4 bg-[#8F5BFF]"
          }
          flex items-center justify-center
        `}
      >
        {/* INNER DOT */}
        <div
          className={`
            rounded-full
            bg-white
            transition-all duration-200
            ${
              hover
                ? "w-2 h-2 opacity-100"
                : "w-1 h-1 opacity-80"
            }
          `}
        />
      </div>
    </div>
  );
}