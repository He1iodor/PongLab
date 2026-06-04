"use client";

import { useEffect, useRef } from "react";

export default function FloatingParticles() {
  const particles = useRef(
    Array.from({ length: 120 }).map(() => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 2 + 0.6,
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.3,
    }))
  ).current;

  const refs = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    let raf: number;

    const loop = () => {
      particles.forEach((p, i) => {
        const el = refs.current[i];
        if (!el) return;

        p.x += p.dx;
        p.y += p.dy;

        const x = p.x;
        const y = p.y;

        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      });

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      {particles.map((p, i) => (
        <div
          key={i}
          ref={(el) => {
            if (el) refs.current[i] = el;
          }}
          className="absolute rounded-full bg-purple-400/70"
          style={{
            width: p.size,
            height: p.size,
            boxShadow: "0 0 10px rgba(167,139,250,0.8)",
            willChange: "transform",
          }}
        />
      ))}
    </>
  );
}
