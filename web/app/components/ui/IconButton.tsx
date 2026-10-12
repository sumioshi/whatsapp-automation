"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Size = "sm" | "md";

/**
 * Botão quadrado para ícones, sem moldura até o hover (engrenagem, anexo, enviar…).
 *
 * Tamanhos:
 *   sm — 32×32 px (h-8 w-8)  — ícone 14–16 px
 *   md — 36×36 px (h-9 w-9)  — ícone 16–18 px  (era h-10 w-10; alinhado ao Button md h-9)
 *
 * Estados: default / hover / active (afunda) / focus-ring / disabled.
 * Anel de foco via .focus-ring.
 *
 * Prop opcional `active` para estado persistentemente ativo (ex.: botão de anexo aberto).
 */

const SIZES: Record<Size, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  /** Estado ativo persistente (ex.: painel aberto). Ganha fundo de destaque. */
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
        // estado default: sem moldura, cor de texto secundário; hover ganha fundo
        !active && "border-transparent bg-transparent text-fg-dim hover:bg-elevated hover:text-fg",
        // estado ativo persistente (painel aberto, filtro ligado)
        active && "border-transparent bg-elevated text-fg",
        "active:translate-y-px",
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
