"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "./cn";

export interface HighlightProps {
  active: boolean;
  children: ReactNode;
  className?: string;
}

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Dá um FLASH ember temporário (bg + box-shadow que decaem ~1s) quando `active`
 * vira true, depois volta ao normal — "olhe aqui" ao navegar até uma mensagem.
 * Reduced-motion → realce estático breve (sem animação), removido por timeout.
 */
export function Highlight({ active, children, className = "" }: HighlightProps) {
  const [flashing, setFlashing] = useState(false);
  const reduced = useRef(false);
  const wasActive = useRef(active);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Dispara só na transição ausente → presente.
    if (active && !wasActive.current) {
      reduced.current = prefersReduced();
      setFlashing(true);
      if (reduced.current) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setFlashing(false), 1000);
      }
    }
    wasActive.current = active;
  }, [active]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div
      className={cn("highlight-flash rounded-control", flashing && "is-flashing", className)}
      onAnimationEnd={() => {
        if (!reduced.current) setFlashing(false);
      }}
    >
      {children}
      <style>{`
        .highlight-flash.is-flashing {
          animation: highlight-flash-fade 1000ms cubic-bezier(0.23, 1, 0.32, 1) both;
        }
        @keyframes highlight-flash-fade {
          0% {
            background-color: color-mix(in oklab, var(--color-accent) 22%, transparent);
            box-shadow: 0 0 0 1px color-mix(in oklab, var(--color-accent) 50%, transparent);
          }
          100% {
            background-color: transparent;
            box-shadow: 0 0 0 1px transparent;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .highlight-flash.is-flashing {
            animation: none;
            background-color: color-mix(in oklab, var(--color-accent) 14%, transparent);
          }
        }
      `}</style>
    </div>
  );
}
