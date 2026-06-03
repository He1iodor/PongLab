"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export default function FloatingParticles() {
  const particles = useRef(
    Array.from({ length: 110 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1.2,
    }))
  ).current;

  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setMouse({
        x: e.clientX,
        y: e.clientY,
      });
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
        const dx = mouse.x - (window.innerWidth * p.x) / 100;
        const dy = mouse.y - (window.innerHeight * p.y) / 100;

        const distance = Math.sqrt(dx * dx + dy * dy);

        // 🟣 stronger influence
        const force = active ? Math.max(140 - distance, 0) * 0.22 : 0;

        const moveX = (dx / (distance || 1)) * force;
        const moveY = (dy / (distance || 1)) * force;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              left: `${p.x}%`,
              top: `${p.y}%`,

              // ✨ brighter glow
              background: "rgba(167, 139, 250, 0.85)",
              boxShadow: "0 0 14px rgba(167, 139, 250, 1)",
            }}
            animate={{
              x: moveX,
              y: moveY,

              // ✨ stronger flicker
              opacity: active
                ? [0.5, 1, 0.6, 1]
                : [0.3, 0.8, 0.4],

              scale: active ? [1, 1.25, 1] : [1, 1.1, 1],
            }}
            transition={{
              duration: active ? 4 : 8, // faster motion
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </>
  );
}
