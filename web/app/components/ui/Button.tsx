"use client";

import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

type Variant = "primary" | "ghost" | "subtle" | "danger";
type Size = "sm" | "md";

/**
 * Variantes:
 *   primary: tinta (preta no claro, branca no escuro). A ação principal de cada tela, uma só.
 *   subtle:  borda forte e fundo do card. Ação comum.
 *   ghost:   sem borda nem fundo até o hover. Ação de apoio.
 *   danger:  fundo vermelho claro. Ação destrutiva.
 */
const VARIANTS: Record<Variant, string> = {
  primary: "border border-ink bg-ink text-on-ink hover:bg-ink/85 active:translate-y-px",
  subtle: "border border-line-2 bg-surface text-fg hover:border-fg-mute hover:bg-elevated active:translate-y-px",
  ghost: "border border-transparent bg-transparent text-fg-dim hover:bg-elevated hover:text-fg active:translate-y-px",
  danger: "border border-transparent bg-danger-bg text-danger hover:border-danger/40 active:translate-y-px",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-[12.5px]",
  md: "h-8 gap-1.5 px-3 text-[13px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      // biome-ignore lint/a11y/useButtonType: type vem da prop com default seguro
      type={type}
      disabled={disabled || loading}
      className={cn(
        // base estrutural
        "focus-ring relative inline-flex shrink-0 select-none items-center justify-center",
        "rounded-control font-medium leading-none",
        "transition-[background-color,border-color,box-shadow,transform,opacity]",
        "duration-[120ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none",
        "focus:outline-none",
        // motion-reduce: sem translate
        "motion-reduce:active:translate-y-0",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />}
      {children}
    </button>
  );
}
