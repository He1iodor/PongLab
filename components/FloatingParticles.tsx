"use client";

import { motion } from "framer-motion";
import { useRef } from "react";

export default function FloatingParticles() {
  const far = useRef(
    Array.from({ length: 90 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 1.2 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0008 + Math.random() * 0.0015,
    }))
  ).current;

  const mid = useRef(
    Array.from({ length: 60 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 1.6 + 0.6,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0015 + Math.random() * 0.0025,
    }))
  ).current;

  const near = useRef(
    Array.from({ length: 30 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.2 + 1,
      phase: Math.random() * Math.PI * 2,
      speed: 0.002 + Math.random() * 0.0035,
    }))
  ).current;

  const renderLayer = (arr: any[], z: number, intensity: number) =>
    arr.map((p, i) => {
      const px = (window.innerWidth * p.x) / 100;
      const py = (window.innerHeight * p.y) / 100;

      const t = Date.now() * p.speed;

      // 🌌 subtle independent drift per layer
      const floatX = Math.cos(t + p.phase) * intensity;
      const floatY = Math.sin(t + p.phase) * intensity;

      const flicker = Math.sin(t * 3);

      const glow = 6 + Math.abs(flicker) * 6;
      const opacity = 0.2 + Math.abs(flicker) * 0.5;

      return (
        <motion.div
          key={`${z}-${i}`}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            left: px,
            top: py,
            zIndex: z,

            background: "rgba(167, 139, 250, 0.85)",
            boxShadow: `0 0 ${glow}px rgba(167, 139, 250, 1)`,
          }}
          animate={{
            x: floatX,
            y: floatY,

            opacity,
            scale: [1, 1.06, 1],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      );
    });

  return (
    <>
      {/* FAR LAYER */}
      {renderLayer(far, 1, 4)}

      {/* MID LAYER */}
      {renderLayer(mid, 2, 8)}

      {/* NEAR LAYER */}
      {renderLayer(near, 3, 12)}
    </>
  );
}
