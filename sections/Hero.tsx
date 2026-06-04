"use client";

import { useEffect, useRef, useState } from "react";
import FloatingParticles from "@/components/FloatingParticles";

export default function Hero() {
  const mouse = useRef({ x: 0, y: 0 });

  const ball = useRef({
    x: 300,
    y: 300,
    px: 300,
    py: 300,
  });

  const ballEl = useRef<HTMLDivElement | null>(null);

  const [renderBall, setRenderBall] = useState({
    x: 300,
    y: 300,
    speed: 0,
  });

  useEffect(() => {
    let raf: number;

    const loop = () => {
      const b = ball.current;

      // 🧲 Verlet physics
      const ax = (mouse.current.x - b.x) * 0.18;
      const ay = (mouse.current.y - b.y) * 0.18;

      const vx = b.x - b.px;
      const vy = b.y - b.py;

      b.px = b.x;
      b.py = b.y;

      b.x += vx + ax;
      b.y += vy + ay;

      const speed = Math.min(Math.hypot(vx, vy), 50);

      if (ballEl.current) {
        ballEl.current.style.transform =
          `translate3d(${b.x}px, ${b.y}px, 0)`;
      }

      setRenderBall({
        x: b.x,
        y: b.y,
        speed,
      });

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section
      className="relative min-h-screen overflow-hidden bg-[#090B18]"
      onMouseMove={(e) => {
        mouse.current.x = e.clientX;
        mouse.current.y = e.clientY;
      }}
    >
      <FloatingParticles />

      {/* BALL */}
      <div
        ref={ballEl}
        className="absolute w-[18px] h-[18px] rounded-full bg-white"
        style={{
          transform: "translate3d(300px,300px,0)",
        }}
      />

      {/* SIMPLE VISUAL FEEDBACK */}
      <div className="absolute bottom-10 left-10 text-white">
        speed: {renderBall.speed.toFixed(2)}
      </div>
    </section>
  );
}
