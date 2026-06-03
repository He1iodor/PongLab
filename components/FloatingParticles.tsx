"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export default function FloatingParticles() {
  const particles = useRef(
    Array.from({ length: 180 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.2 + 0.6,

      driftX: (Math.random() - 0.5) * 0.6,
      driftY: (Math.random() - 0.5) * 0.6,

      phase: Math.random() * Math.PI * 2,
      speed: 0.0015 + Math.random() * 0.003,
    }))
  ).current;

  const [screen, setScreen] = useState({
    width: 0,
    height: 0,
  });

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

  const timeRef = useRef(Date.now());

  return (
    <>
      {particles.map((p, i) => {
        const px = (screen.width * p.x) / 100;
        const py = (screen.height * p.y) / 100;

        const t = Date.now() * p.speed;

        const floatX =
          Math.cos(t + p.phase) * 10 + p.driftX * 12;

        const floatY =
          Math.sin(t + p.phase) * 10 + p.driftY * 12;

        const flicker = Math.sin(t * 3);

        const glow = 6 + Math.abs(flicker) * 6;
        const opacity = 0.2 + Math.abs(flicker) * 0.4;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              left: px,
              top: py,

              background: "rgba(167, 139, 250, 0.8)",
              boxShadow: `0 0 ${glow}px rgba(167, 139, 250, 1)`,
            }}
            animate={{
              x: floatX,
              y: floatY,
              opacity,
              scale: [1, 1.08, 1],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </>
  );
}
