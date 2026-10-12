import type { ReactNode } from "react";
import { cn } from "./cn";

type Variant = "accent" | "neutral" | "ok" | "warn" | "danger" | "info";

/** Chip de estado: texto na fonte de interface, fundo tingido, a cor sempre acompanhada de texto. */
const VARIANTS: Record<Variant, string> = {
  accent: "bg-accent-soft text-accent",
  neutral: "bg-elevated text-fg-dim",
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  info: "bg-accent-soft text-info",
};

const DOT_COLORS: Record<Variant, string> = {
  accent: "bg-accent",
  neutral: "bg-fg-mute",
  ok: "bg-ok",
  warn: "bg-warn-mark",
  danger: "bg-danger",
  info: "bg-info",
};

export interface BadgeProps {
  variant?: Variant;
  /** Mostra um ponto de status à esquerda do texto. */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({
  variant = "neutral",
  dot = false,
  className = "",
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-tag px-2 text-[12px] font-medium leading-none",
        "transition-colors duration-[140ms] ease-out",
        VARIANTS[variant],
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
            DOT_COLORS[variant],
          )}
        />
      )}
      {children}
    </span>
  );
}
