"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  phase: number;
};

type Shooting = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
};

export default function FloatingParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Star[]>([]);
  const shootingRef = useRef<Shooting[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      const count = 180; // 🔥 OPTIMIZED (was 350)

      starsRef.current = Array.from({ length: count }).map(() => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        baseX: Math.random() * canvas.width,
        baseY: Math.random() * canvas.height,
        size: Math.random() * 1.2 + 0.5,
        phase: Math.random() * 1000,
      }));
    };

    resize();
    window.addEventListener("resize", resize);

    const spawnShooting = () => {
      shootingRef.current.push({
        x: 0,
        y: Math.random() * canvas.height * 0.6,
        vx: 6 + Math.random() * 4,
        vy: 2 + Math.random() * 3,
        life: 0,
      });
    };

    const drawStar = (x: number, y: number, size: number, glow: number) => {
      ctx.beginPath();

      // ✨ SIMPLE CROSS STAR (no shadows, no gradients)
      ctx.moveTo(x - size * 4, y);
      ctx.lineTo(x + size * 4, y);
      ctx.moveTo(x, y - size * 4);
      ctx.lineTo(x, y + size * 4);

      ctx.strokeStyle = `rgba(200,160,255,${0.3 + glow * 0.4})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 🌟 STARS
      for (let i = 0; i < starsRef.current.length; i++) {
        const s = starsRef.current[i];

        // ultra cheap motion
        s.x += (s.baseX - s.x) * 0.005;
        s.y += (s.baseY - s.y) * 0.005;

        const glow = (Math.sin(s.phase + Date.now() * 0.002) + 1) * 0.5;

        drawStar(s.x, s.y, s.size, glow);
      }

      // 💫 shooting stars (rare)
      if (Math.random() < 0.01) spawnShooting();

      for (let i = shootingRef.current.length - 1; i >= 0; i--) {
        const s = shootingRef.current[i];

        s.x += s.vx;
        s.y += s.vy;
        s.life++;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 8, s.y - s.vy * 8);

        ctx.strokeStyle = `rgba(255,255,255,${1 - s.life / 50})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (s.life > 50) shootingRef.current.splice(i, 1);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
    />
  );
}
