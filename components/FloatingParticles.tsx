"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
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

      // ⭐ create MASSIVE starfield
      const count = 300;

      starsRef.current = Array.from({ length: count }).map(() => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        baseX: Math.random() * canvas.width,
        baseY: Math.random() * canvas.height,
        z: Math.random() * 1 + 0.2,
      }));
    };

    resize();
    window.addEventListener("resize", resize);

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

      // 🌌 STAR FIELD
      for (const star of starsRef.current) {
        star.x += (star.baseX - star.x) * 0.01;
        star.y += (star.baseY - star.y) * 0.01;

        const size = star.z * 1.5;

        const glow = 0.5 + Math.sin(Date.now() * 0.002 + star.x) * 0.5;

        ctx.beginPath();
        ctx.fillStyle = `rgba(180,120,255,${0.3 + glow * 0.4})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = "rgba(180,120,255,0.6)";
        ctx.arc(star.x, star.y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 💫 SHOOTING STARS
      if (Math.random() < 0.015) {
        spawnShootingStar();
      }

      shootingRef.current = shootingRef.current.filter((s) => {
        s.x += s.vx;
        s.y += s.vy;
        s.life++;

        const alpha = 1 - s.life / s.maxLife;

        // tail (light ray effect)
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 10, s.y - s.vy * 10);

        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.shadowBlur = 15;
        ctx.shadowColor = "rgba(160,120,255,0.8)";
        ctx.lineWidth = 2;
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
