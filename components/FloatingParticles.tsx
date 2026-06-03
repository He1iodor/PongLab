"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export default function FloatingParticles() {
  const far = useRef(
    Array.from({ length: 90 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 1.2 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0006 + Math.random() * 0.0012,
    }))
  ).current;

  const mid = useRef(
    Array.from({ length: 70 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 1.6 + 0.6,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0012 + Math.random() * 0.0022,
    }))
  ).current;

  const near = useRef(
    Array.from({ length: 40 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.2 + 1,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0018 + Math.random() * 0.0032,
    }))
  ).current;

  const [screen, setScreen] = useState({ width: 0, height: 0 });

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

  // 🌫️ subtle “camera drift”
  const cameraX =
    Math.sin(Date.now() * 0.0001) * 12;

  const cameraY =
    Math.cos(Date.now() * 0.0001) * 10;

  const renderLayer = (
    arr: any[],
    z: number,
    intensity: number,
    cameraMultiplier: number
  ) =>
    arr.map((p, i) => {
      const px =
        (screen.width * p.x) / 100 +
        cameraX * cameraMultiplier;

      const py =
        (screen.height * p.y) / 100 +
        cameraY * cameraMultiplier;

      const t = Date.now() * p.speed;

      const floatX =
        Math.cos(t + p.phase) * intensity;

      const floatY =
        Math.sin(t + p.phase) * intensity;

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
      {/* FAR — почти статичный */}
      {renderLayer(far, 1, 3, 0.2)}

      {/* MID — лёгкое движение */}
      {renderLayer(mid, 2, 6, 0.6)}

      {/* NEAR — живой слой */}
      {renderLayer(near, 3, 10, 1.2)}
    </>
  );
}
