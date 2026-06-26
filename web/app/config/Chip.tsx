"use client";

import type { ReactNode } from "react";
import { cn } from "@/app/components/ui";

interface ChipProps {
  /** Pílula clicável (filtro de tag). on = realce accent. */
  active?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

/** Chip-pílula local da tela de config — visual alinhado ao Badge do kit. */
export function Chip({ active = false, onClick, className = "", children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-ring mono rounded-full border px-2 py-0.5 text-xs transition-colors",
        active
          ? "border-accent/30 bg-accent/10 text-accent"
          : "border-line bg-surface-2 text-fg-dim hover:border-line-2",
        className,
      )}
    >
      {children}
    </button>
  );
}
