"use client";

import { useEffect, useRef } from "react";

export default function FloatingParticles() {
  const particles = useRef(
    Array.from({ length: 120 }).map(() => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 2 + 0.6,
    }))
  ).current;

  const refs = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    let raf: number;

    const loop = () => {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const el = refs.current[i];
        if (!el) continue;

        p.x += p.dx;
        p.y += p.dy;

        // wrap screen
        if (p.x < 0) p.x = window.innerWidth;
        if (p.x > window.innerWidth) p.x = 0;
        if (p.y < 0) p.y = window.innerHeight;
        if (p.y > window.innerHeight) p.y = 0;

        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      }

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
