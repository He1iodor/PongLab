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
      speed: 0.2 + Math.random() * 0.6,
    }))
  ).current;

  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const [screen, setScreen] = useState({ width: 0, height: 0 });

  // screen size safe
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

  // mouse tracking
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setMouse({ x: e.clientX, y: e.clientY });
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

  return (
    <>
      {particles.map((p, i) => {
        const px = (screen.width * p.x) / 100;
        const py = (screen.height * p.y) / 100;

        // 🌟 base star floating motion
        const floatX = Math.cos(Date.now() * 0.0003 + p.drift) * 8;
        const floatY = Math.sin(Date.now() * 0.0003 + p.drift) * 8;

        // 🍃 mouse wind (soft, not pulling hard)
        const windX = active ? (mouse.x - px) * 0.002 : 0;
        const windY = active ? (mouse.y - py) * 0.002 : 0;

        // 🟣 ball influence (local only, not global collapse)
        const dxBall = ball?.x - px;
        const dyBall = ball?.y - py;
        const distBall = Math.sqrt(dxBall * dxBall + dyBall * dyBall);

        const ballForce =
          distBall < 180 ? (180 - distBall) * 0.03 : 0;

        const ballX = (dxBall / (distBall || 1)) * ballForce;
        const ballY = (dyBall / (distBall || 1)) * ballForce;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              left: px,
              top: py,

              background: "rgba(167, 139, 250, 0.85)",
              boxShadow: "0 0 10px rgba(167, 139, 250, 0.9)",
            }}
            animate={{
              x: floatX + windX + ballX,
              y: floatY + windY + ballY,

              opacity: active
                ? [0.4, 1, 0.6]
                : [0.25, 0.6, 0.3],

              scale: active ? [1, 1.15, 1] : [1, 1.05, 1],
            }}
            transition={{
              duration: active ? 4 : 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </>
  );
}
