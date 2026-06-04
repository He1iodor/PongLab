"use client";

import { useEffect, useRef } from "react";

export default function FloatingParticles() {
  const particles = useRef<any[]>([]);
  const refs = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    particles.current = Array.from({ length: 120 }).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 2 + 0.6,
    }));

    let raf: number;

    const loop = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      for (let i = 0; i < particles.current.length; i++) {
        const p = particles.current[i];
        const el = refs.current[i];
        if (!el) continue;

        p.x += p.dx;
        p.y += p.dy;

        // wrap
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      {Array.from({ length: 120 }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            if (el) refs.current[i] = el;
          }}
          className="absolute rounded-full bg-purple-400/70"
          style={{
            width: 2,
            height: 2,
            boxShadow: "0 0 10px rgba(167,139,250,0.8)",
            willChange: "transform",
          }}
        />
      ))}
    </>
  );
}
