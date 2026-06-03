"use client";

import { useEffect, useState } from "react";

interface CounterProps {
  end: number;
}

export default function Counter({
  end,
}: CounterProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;

    const timer = setInterval(() => {
      start += Math.ceil(end / 60);

      if (start >= end) {
        start = end;
        clearInterval(timer);
      }

      setCount(start);
    }, 25);

    return () => clearInterval(timer);
  }, [end]);

  return count;
}