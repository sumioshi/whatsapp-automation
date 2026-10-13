"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/app/components/ui";
import { corDoMatiz, matizDaEtiqueta } from "@/lib/aparencia";

interface ChipProps {
  /** Pílula clicável de filtro (tag). Ligada fica no acento. */
  active?: boolean;
  onClick?: () => void;
  /** Nome que dá a cor do ponto, como nas etiquetas. */
  matiz?: string;
  className?: string;
  children: ReactNode;
}

/** Filtro em pílula com ponto de cor, no desenho da etiqueta; ligado, ganha o fundo do acento. */
export function Chip({ active = false, onClick, matiz, className = "", children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={matiz ? ({ "--hue": corDoMatiz(matizDaEtiqueta(matiz)) } as CSSProperties) : undefined}
      className={cn(
        "focus-ring inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium transition-colors",
        active
          ? "bg-accent-soft text-accent shadow-[inset_0_0_0_1px_var(--color-accent-line)]"
          : "bg-surface text-fg-dim shadow-[inset_0_0_0_1px_var(--color-line-2)] hover:bg-elevated hover:text-fg",
        className,
      )}
    >
      {matiz && <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--hue)]" />}
      {children}
    </button>
  );
}
