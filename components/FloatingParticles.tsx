"use client";

import { useEffect, useRef, useState } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseSize: number;
  glow: number;
  twinkle: number;
};

export default function FloatingParticles() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const rafRef = useRef<number | null>(null);

  // init
  useEffect(() => {
    const count = 60;

    const initial: Particle[] = Array.from({ length: count }).map(() => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      baseSize: Math.random() * 2 + 1,
      glow: Math.random(),
      twinkle: Math.random() * 100,
    }));

    setParticles(initial);
  }, []);

  // animation loop
  useEffect(() => {
    const update = () => {
      setParticles((prev) =>
        prev.map((p) => {
          let x = p.x + p.vx;
          let y = p.y + p.vy;

          // wrap edges
          if (x < 0) x = window.innerWidth;
          if (x > window.innerWidth) x = 0;
          if (y < 0) y = window.innerHeight;
          if (y > window.innerHeight) y = 0;

          return {
            ...p,
            x,
            y,
            twinkle: p.twinkle + 0.8,
            glow: Math.sin(p.twinkle * 0.02) * 0.5 + 0.5,
          };
        })
      );

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {particles.map((p, i) => {
        const glow = p.glow;
        const size = p.baseSize + glow * 2;

        return (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: p.x,
              top: p.y,
              width: size,
              height: size,
              transform: "translate(-50%, -50%)",

              // ⭐ STAR CORE
              background: `radial-gradient(circle,
                rgba(255,255,255,${0.9 * glow}) 0%,
                rgba(180,120,255,${0.6 * glow}) 40%,
                rgba(0,0,0,0) 70%)`,

              // ✨ STAR RAYS (glow lines effect)
              boxShadow: `
                0 0 ${10 + glow * 20}px rgba(180,120,255,${0.6 * glow}),
                0 0 ${20 + glow * 30}px rgba(120,200,255,${0.3 * glow})
              `,

              filter: `blur(${0.5 + glow}px)`,

              opacity: 0.6 + glow * 0.4,
            }}
          />
        );
      })}
    </div>
  );
}
