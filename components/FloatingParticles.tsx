"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export default function FloatingParticles() {
  const particles = useRef(
    Array.from({ length: 60 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      speed: Math.random() * 0.2 + 0.05,
      driftX: 0,
      driftY: 0,
    }))
  ).current;

  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setMouse({
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
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
        const driftStrength = active ? 1 : 0;

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
              boxShadow: "0 0 8px rgba(143,91,255,0.8)",
            }}
            animate={{
              x: mouse.x * 20 * driftStrength,
              y: mouse.y * 20 * driftStrength,
              opacity: active
                ? [0.3, 0.8, 0.3]
                : [0.2, 0.5, 0.2],
              scale: active ? [1, 1.2, 1] : [1, 1.05, 1],
            }}
            transition={{
              duration: active ? 6 : 10,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </>
  );
}
