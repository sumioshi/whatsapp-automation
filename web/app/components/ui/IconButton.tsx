"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Size = "sm" | "md";

/**
 * Botão quadrado ghost pra ícones (engrenagem, anexo, send, etc.).
 *
 * Tamanhos:
 *   sm — 32×32 px (h-8 w-8)  — ícone 14–16 px
 *   md — 36×36 px (h-9 w-9)  — ícone 16–18 px  (era h-10 w-10; alinhado ao Button md h-9)
 *
 * Estados: default / hover / active (afunda) / focus-ring / disabled.
 * Profundidade via shadow-pressable; anel de foco via .focus-ring.
 *
 * Prop opcional `active` para estado persistentemente ativo (ex.: botão de anexo aberto).
 */

const SIZES: Record<Size, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  /** Estado ativo persistente (ex.: painel aberto). Aplica tint ember sutil. */
  active?: boolean;
}

export function IconButton({
  size = "md",
  active = false,
  className = "",
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      // biome-ignore lint/a11y/useButtonType: type vem da prop com default seguro
      type={type}
      className={cn(
        // base
        "focus-ring grid shrink-0 select-none place-items-center rounded-control",
        "border transition-[background-color,border-color,box-shadow,transform,opacity,color]",
        "duration-[120ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        "focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none",
        "motion-reduce:active:translate-y-0",
        // estado default / hover
        !active && "border-line bg-surface-2 text-fg-dim [box-shadow:var(--shadow-pressable)] hover:border-line-2 hover:bg-elevated hover:text-fg",
        // estado ativo persistente — tint ember muito leve
        active && "border-accent/35 bg-accent/10 text-accent [box-shadow:0_0_0_1px_color-mix(in_oklab,var(--color-accent)_20%,transparent)] hover:border-accent/50 hover:bg-accent/16",
        // afunda no :active (pressiona)
        "active:[box-shadow:var(--shadow-pressable-active)] active:translate-y-px",
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
