"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export default function FloatingParticles({ mousePosition }: any) {
  const [screen, setScreen] = useState({ w: 0, h: 0 });

  // 🧠 track mouse speed (key for “alive only on movement” effect)
  const lastMouse = useRef({ x: 0, y: 0, t: Date.now() });
  const [speed, setSpeed] = useState(0);

  useEffect(() => {
    setScreen({
      w: window.innerWidth,
      h: window.innerHeight,
    });
  }, []);

  // 🧠 compute mouse movement speed
  useEffect(() => {
    if (!mousePosition) return;

    const now = Date.now();
    const dx = mousePosition.x - lastMouse.current.x;
    const dy = mousePosition.y - lastMouse.current.y;

    const dist = Math.sqrt(dx * dx + dy * dy);
    const dt = now - lastMouse.current.t;

    const s = dt ? dist / dt : 0;

    setSpeed(s);

    lastMouse.current = {
      x: mousePosition.x,
      y: mousePosition.y,
      t: now,
    };
  }, [mousePosition]);

  const particles = Array.from({ length: 120 }); // 🔥 DENSITY BOOST

  return (
    <>
      {particles.map((_, i) => {
        const size = Math.random() * 3 + 1; // small glitter

        const baseX = Math.random() * 100;
        const baseY = Math.random() * 100;

        // 🧊 idle state = almost frozen
        const idleOpacity = 0.12;

        // 🌀 movement effect = depends on speed
        const moveFactor = Math.min(speed * 2.5, 2.5);

        const dx =
          mousePosition && screen.w
            ? (mousePosition.x - screen.w / 2) * 0.0003 * moveFactor
            : 0;

        const dy =
          mousePosition && screen.h
            ? (mousePosition.y - screen.h / 2) * 0.0003 * moveFactor
            : 0;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: size,
              height: size,
              left: `${baseX}%`,
              top: `${baseY}%`,

              // ✨ glitter look
              background:
                Math.random() > 0.5
                  ? "rgba(255,255,255,0.9)"
                  : "rgba(143,91,255,0.8)",

              boxShadow:
                Math.random() > 0.5
                  ? "0 0 8px rgba(255,255,255,0.8)"
                  : "0 0 10px rgba(143,91,255,0.8)",
            }}
            animate={{
              x: dx,
              y: dy,

              // 🧊 stays still unless mouse moves
              opacity: speed > 0.2 ? 0.35 : idleOpacity,

              scale: speed > 0.2 ? 1.2 : 1,
            }}
            transition={{
              type: "spring",
              stiffness: speed > 0.2 ? 60 : 15,
              damping: speed > 0.2 ? 20 : 40,
            }}
          />
        );
      })}
    </>
  );
}
