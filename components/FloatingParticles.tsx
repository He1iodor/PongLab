"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  twinkle: number;
  speed: number;
};

type ShootingStar = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
};

export default function FloatingParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Star[]>([]);
  const shootingRef = useRef<ShootingStar[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      // ⭐ LOTS OF STARS
      const count = 350;

      starsRef.current = Array.from({ length: count }).map(() => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        baseX: Math.random() * canvas.width,
        baseY: Math.random() * canvas.height,
        size: Math.random() * 1.2 + 0.4,
        twinkle: Math.random() * 1000,
        speed: Math.random() * 0.3 + 0.1,
      }));
    };

    resize();
    window.addEventListener("resize", resize);

    const drawStar = (
      x: number,
      y: number,
      size: number,
      glow: number
    ) => {
      ctx.save();
      ctx.translate(x, y);

      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 6);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * glow})`);
      g.addColorStop(0.3, `rgba(180,120,255,${0.6 * glow})`);
      g.addColorStop(1, "rgba(0,0,0,0)");

      ctx.strokeStyle = g;
      ctx.shadowBlur = 12;
      ctx.shadowColor = "rgba(180,120,255,0.6)";
      ctx.lineWidth = 1;

      // ✨ CROSS STAR ( + )
      ctx.beginPath();
      ctx.moveTo(-size * 6, 0);
      ctx.lineTo(size * 6, 0);
      ctx.moveTo(0, -size * 6);
      ctx.lineTo(0, size * 6);
      ctx.stroke();

      // ✨ DIAGONAL STAR ( X )
      ctx.beginPath();
      ctx.moveTo(-size * 4, -size * 4);
      ctx.lineTo(size * 4, size * 4);
      ctx.moveTo(size * 4, -size * 4);
      ctx.lineTo(-size * 4, size * 4);
      ctx.stroke();

      ctx.restore();
    };

    const spawnShootingStar = () => {
      const edge = Math.random() > 0.5;

      shootingRef.current.push({
        x: edge ? 0 : Math.random() * canvas.width,
        y: edge ? Math.random() * canvas.height * 0.5 : 0,
        vx: 6 + Math.random() * 6,
        vy: 3 + Math.random() * 6,
        life: 0,
        maxLife: 60 + Math.random() * 30,
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 🌌 STARS (cross + glow)
      for (const star of starsRef.current) {
        star.x += (star.baseX - star.x) * 0.01;
        star.y += (star.baseY - star.y) * 0.01;

        star.twinkle += star.speed;

        const glow = (Math.sin(star.twinkle * 0.01) + 1) * 0.5;

        drawStar(star.x, star.y, star.size, glow);
      }

      // 💫 SHOOTING STARS
      if (Math.random() < 0.02) {
        spawnShootingStar();
      }

      shootingRef.current = shootingRef.current.filter((s) => {
        s.x += s.vx;
        s.y += s.vy;
        s.life++;

        const alpha = 1 - s.life / s.maxLife;

        // tail
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 12, s.y - s.vy * 12);

        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.shadowBlur = 20;
        ctx.shadowColor = "rgba(180,120,255,0.8)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        return s.life < s.maxLife;
      });

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
