"use client";

import { motion } from "framer-motion";

export default function FloatingParticles({ mousePosition }: any) {
  const particles = Array.from({ length: 20 });

  return (
    <>
      {particles.map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-[#8F5BFF] opacity-20"
          style={{
            width: Math.random() * 6 + 2,
            height: Math.random() * 6 + 2,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -60, 0],
            x: mousePosition
              ? (mousePosition.x - window.innerWidth / 2) * 0.0005
              : 0,
            opacity: [0.1, 0.4, 0.1],
          }}
          transition={{
            duration: 8 + Math.random() * 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </>
  );
}
