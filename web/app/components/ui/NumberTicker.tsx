"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";

export interface NumberTickerProps {
  value: number;
  className?: string;
}

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Conta até `value` com um tween curto (~200ms, outQuint) quando ele muda.
 * Usa `.mono`/`tabular-nums` (tnum) pra largura não dançar. Reduced-motion → seta seco.
 * Pra contadores ("3 pendem", "12 hoje", badges de não-lidas).
 */
export function NumberTicker({ value, className = "" }: NumberTickerProps) {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReduced() || from.current === value) {
      setDisplay(value);
      from.current = value;
      return;
    }
    const ms = 200;
    const start = performance.now();
    const a = from.current;
    const b = value;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - t) ** 5; // outQuint, casa com --ease-out-quint
      setDisplay(Math.round(a + (b - a) * eased));
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        from.current = b;
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value]);

  return <span className={cn("mono tabular-nums", className)}>{display}</span>;
}
