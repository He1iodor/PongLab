"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export default function FloatingParticles({ ball }: any) {
  const particles = useRef(
    Array.from({ length: 180 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.4 + 0.6,

      driftX: (Math.random() - 0.5) * 0.6,
      driftY: (Math.random() - 0.5) * 0.6,

      phase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.002 + Math.random() * 0.004,
    }))
  ).current;

  const mouseRef = useRef({ x: 0, y: 0 });
  const prevMouseRef = useRef({ x: 0, y: 0 });

  const [active, setActive] = useState(false);
  const [screen, setScreen] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const update = () => {
      setScreen({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      prevMouseRef.current = mouseRef.current;

      mouseRef.current = {
        x: e.clientX,
        y: e.clientY,
      };

      setActive(true);
    };

    const handleLeave = () => setActive(false);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseleave", handleLeave);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  const velocityX =
    mouseRef.current.x - prevMouseRef.current.x;
  const velocityY =
    mouseRef.current.y - prevMouseRef.current.y;

  return (
    <>
      {particles.map((p, i) => {
        const px = (screen.width * p.x) / 100;
        const py = (screen.height * p.y) / 100;

        // 🌟 natural slow movement (FIXED)
        const time = Date.now() * p.twinkleSpeed;

        const floatX =
          Math.cos(time + p.phase) * 10 + p.driftX * 20;
        const floatY =
          Math.sin(time + p.phase) * 10 + p.driftY * 20;

        // 🍃 stronger wind
        const windStrength = active ? 0.012 : 0.002;

        const windX =
          (mouseRef.current.x - px) * windStrength;
        const windY =
          (mouseRef.current.y - py) * windStrength;

        const velocityInfluence = active ? 0.2 : 0;

        const velX = velocityX * velocityInfluence;
        const velY = velocityY * velocityInfluence;

        // 🟣 ball influence
        const dxBall =
          (ball?.x ?? screen.width / 2) - px;
        const dyBall =
          (ball?.y ?? screen.height / 2) - py;

        const distBall = Math.sqrt(
          dxBall * dxBall + dyBall * dyBall
        );

        const ballForce =
          distBall < 200
            ? (200 - distBall) * 0.03
            : 0;

        const ballX =
          (dxBall / (distBall || 1)) * ballForce;

        const ballY =
          (dyBall / (distBall || 1)) * ballForce;

        // ✨ star peak flicker
        const flicker = Math.sin(time * 3);

        const glow = active
          ? 18 + flicker * 10
          : 10 + flicker * 6;

        const opacity = active
          ? 0.4 + Math.abs(flicker) * 0.6
          : 0.2 + Math.abs(flicker) * 0.4;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              left: px,
              top: py,

              background: "rgba(167, 139, 250, 0.9)",
              boxShadow: `0 0 ${glow}px rgba(167, 139, 250, 1)`,
            }}
            animate={{
              x: floatX + windX + velX + ballX,
              y: floatY + windY + velY + ballY,

              opacity,
              scale: active ? [1, 1.25, 1] : [1, 1.08, 1],
            }}
            transition={{
              duration: active ? 3 : 6,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </>
  );
}
