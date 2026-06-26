"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

type Variant = "primary" | "ghost" | "subtle" | "danger";
type Size = "sm" | "md";

/**
 * Variantes:
 *   primary — fundo ember sólido, texto accent-ink. CTA e ação primária.
 *   ghost   — borda + tint ember muito leve, texto ember. Ação secundária confirmada.
 *   subtle  — borda hairline line, fundo surface-2, texto fg. Ação neutra.
 *   danger  — borda + tint danger. Ação destrutiva.
 *
 * Profundidade via .pressable (shadow-pressable + afunda 1px no :active).
 * Focus via .focus-ring (anel ember ember/14%).
 */
const VARIANTS: Record<Variant, string> = {
  primary: [
    "bg-accent text-accent-ink border border-accent/0",
    // topo iluminado + glow contido ember
    "[box-shadow:inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.45),0_0_0_1px_color-mix(in_oklab,var(--color-accent)_40%,transparent)]",
    "hover:bg-accent-2 hover:[box-shadow:inset_0_1px_0_rgba(255,255,255,0.22),0_1px_3px_rgba(0,0,0,0.5),0_0_0_1px_color-mix(in_oklab,var(--color-accent-2)_45%,transparent)]",
    "active:[box-shadow:inset_0_1px_2px_rgba(0,0,0,0.4)] active:translate-y-px",
  ].join(" "),

  ghost: [
    "border border-accent/30 bg-accent/8 text-accent",
    "hover:border-accent/50 hover:bg-accent/14",
    "active:bg-accent/10 active:translate-y-px",
  ].join(" "),

  subtle: [
    "border border-line bg-surface-2 text-fg",
    "[box-shadow:var(--shadow-pressable)]",
    "hover:border-line-2 hover:bg-elevated hover:text-fg",
    "active:[box-shadow:var(--shadow-pressable-active)] active:translate-y-px",
  ].join(" "),

  danger: [
    "border border-danger/30 bg-danger/8 text-danger",
    "hover:border-danger/50 hover:bg-danger/14",
    "active:bg-danger/10 active:translate-y-px",
  ].join(" "),
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1",
  md: "h-9 px-4  text-sm gap-1.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
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
