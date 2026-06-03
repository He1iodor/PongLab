"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export default function FloatingParticles({ ball }: any) {
  const particles = useRef(
    Array.from({ length: 160 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.6 + 0.8,
      drift: Math.random() * Math.PI * 2,
    }))
  ).current;

  const mouseRef = useRef({ x: 0, y: 0 });
  const prevMouseRef = useRef({ x: 0, y: 0 });

  const [active, setActive] = useState(false);
  const [screen, setScreen] = useState({ width: 0, height: 0 });

  // screen size
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

  // mouse tracking (optimized with refs → no rerenders)
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

        // 🌟 base floating stars
        const floatX =
          Math.cos(Date.now() * 0.00025 + p.drift) * 6;
        const floatY =
          Math.sin(Date.now() * 0.00025 + p.drift) * 6;

        // 🍃 STRONG WIND (cursor influence)
        const windStrength = active ? 0.012 : 0.002;

        const windX =
          (mouseRef.current.x - px) * windStrength;
        const windY =
          (mouseRef.current.y - py) * windStrength;

        // 🌬️ velocity (motion streak)
        const velocityInfluence = active ? 0.18 : 0;

        const velX = velocityX * velocityInfluence;
        const velY = velocityY * velocityInfluence;

        // 🟣 ball local field
        const dxBall = (ball?.x ?? screen.width / 2) - px;
        const dyBall = (ball?.y ?? screen.height / 2) - py;

        const distBall = Math.sqrt(
          dxBall * dxBall + dyBall * dyBall
        );

        const ballForce =
          distBall < 180
            ? (180 - distBall) * 0.03
            : 0;

        const ballX =
          (dxBall / (distBall || 1)) * ballForce;

        const ballY =
          (dyBall / (distBall || 1)) * ballForce;

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
              boxShadow:
                "0 0 10px rgba(167, 139, 250, 0.9)",
            }}
            animate={{
              x: floatX + windX + velX + ballX,
              y: floatY + windY + velY + ballY,

              opacity: active
                ? [0.4, 1, 0.6]
                : [0.25, 0.6, 0.3],

              scale: active
                ? [1, 1.2, 1]
                : [1, 1.05, 1],
            }}
            transition={{
              duration: active ? 3.2 : 7,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </>
  );
}
