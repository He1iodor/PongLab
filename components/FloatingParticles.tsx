"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export default function FloatingParticles({ ball }: any) {
  const particles = useRef(
    Array.from({ length: 160 }).map(() => ({
      angle: Math.random() * Math.PI * 2,
      radius: 30 + Math.random() * 140,
      size: Math.random() * 3 + 1,
      speed: 0.002 + Math.random() * 0.003,
      offset: Math.random() * 1000,
    }))
  ).current;

  const [mouse, setMouse] = useState({ x: 0, y: 0 });
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

  const centerX = ball?.x ?? screen.width / 2;
  const centerY = ball?.y ?? screen.height / 2;

  return (
    <>
      {particles.map((p, i) => {
        // 🌪️ orbit evolution
        const t = Date.now() * p.speed + p.offset;

        const orbitX = Math.cos(t + p.angle) * p.radius;
        const orbitY = Math.sin(t + p.angle) * p.radius;

        // 🧲 slight pull to ball position
        const dx = centerX + orbitX - (screen.width * 0.5);
        const dy = centerY + orbitY - (screen.height * 0.5);

        // ✨ velocity influence from mouse
        const mouseForce = active
          ? Math.sin(mouse.x * 0.01 + i) * 6
          : 0;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,

              left: "50%",
              top: "50%",

              background: "rgba(167, 139, 250, 0.95)",
              boxShadow: "0 0 18px rgba(167, 139, 250, 1)",
              filter: "blur(0.2px)",
            }}
            animate={{
              x: dx + mouseForce,
              y: dy + mouseForce,

              opacity: active
                ? [0.4, 1, 0.6]
                : [0.25, 0.6, 0.3],

              scale: active ? [1, 1.25, 1] : [1, 1.1, 1],
            }}
            transition={{
              duration: active ? 2.5 : 6,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </>
  );
}
