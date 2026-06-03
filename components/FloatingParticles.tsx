"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export default function FloatingParticles() {
  const particles = useRef(
    Array.from({ length: 70 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      baseX: 0,
      baseY: 0,
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

        // 🟣 cursor influence (gravity)
        const cursorForce = active ? Math.max(80 - distance, 0) * 0.15 : 0;

        const moveX = dx / (distance || 1) * cursorForce;
        const moveY = dy / (distance || 1) * cursorForce;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              left: `${p.x}%`,
              top: `${p.y}%`,
              background: "rgba(143,91,255,0.6)",
              boxShadow: "0 0 10px rgba(143,91,255,0.8)",
            }}
            animate={{
              x: moveX,
              y: moveY,
              opacity: active ? 0.7 : 0.4,
              scale: active ? 1.2 : 1,
            }}
            transition={{
              type: "spring",
              stiffness: 30,
              damping: 20,
            }}
          />
        );
      })}
    </>
  );
}
