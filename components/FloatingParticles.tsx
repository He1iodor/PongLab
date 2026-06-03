"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function FloatingParticles({ mousePosition }: any) {
  const [screen, setScreen] = useState({ w: 0, h: 0 });

  useEffect(() => {
    setScreen({
      w: window.innerWidth,
      h: window.innerHeight,
    });
  }, []);

  const particles = Array.from({ length: 28 });

  return (
    <>
      {particles.map((_, i) => {
        const size = Math.random() * 5 + 2;

        const baseX = Math.random() * 100;
        const baseY = Math.random() * 100;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full bg-white opacity-10"
            style={{
              width: size,
              height: size,
              left: `${baseX}%`,
              top: `${baseY}%`,
              boxShadow: "0 0 10px rgba(255,255,255,0.8)",
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.05, 0.2, 0.05],
            }}
            transition={{
              duration: 12 + Math.random() * 10,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}

      {/* 🔥 reactive glow layer */}
      {particles.map((_, i) => {
        const size = Math.random() * 3 + 1;

        const baseX = Math.random() * 100;
        const baseY = Math.random() * 100;

        const dx =
          mousePosition && screen.w
            ? (mousePosition.x - screen.w / 2) * 0.0008
            : 0;

        const dy =
          mousePosition && screen.h
            ? (mousePosition.y - screen.h / 2) * 0.0008
            : 0;

        return (
          <motion.div
            key={`glow-${i}`}
            className="absolute rounded-full bg-[#8F5BFF] opacity-20 blur-[2px]"
            style={{
              width: size,
              height: size,
              left: `${baseX}%`,
              top: `${baseY}%`,
            }}
            animate={{
              x: dx,
              y: dy,
              opacity: mousePosition ? 0.35 : 0.1,
            }}
            transition={{
              type: "spring",
              stiffness: 40,
              damping: 25,
            }}
          />
        );
      })}
    </>
  );
}
