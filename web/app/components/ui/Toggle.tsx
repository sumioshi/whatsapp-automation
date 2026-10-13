"use client";

import { cn } from "./cn";

export interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
  /** Tamanho do controle. Default: "md". */
  size?: "sm" | "md";
}

/**
 * Chave liga/desliga. Desligada: trilho vazado com borda e botão cinza. Ligada: trilho no
 * acento e botão na cor de texto sobre o acento. Uma borda invisível leva a área de toque a
 * 40 px de altura sem mudar o desenho.
 */
export function Toggle({ checked, onChange, disabled, "aria-label": ariaLabel, className = "", size = "md" }: ToggleProps) {
  const sm = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "focus-ring relative inline-flex shrink-0 cursor-pointer select-none items-center rounded-full border",
        "before:absolute before:-inset-x-1.5 before:-inset-y-2.5 before:content-['']",
        "transition-[background-color,border-color] duration-150 ease-out motion-reduce:transition-none",
        "disabled:cursor-not-allowed disabled:opacity-40",
        sm ? "h-4 w-7" : "h-5 w-9",
        checked ? "border-accent bg-accent" : "border-line-2 bg-surface hover:border-fg-mute",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute rounded-full transition-transform duration-150 ease-out motion-reduce:transition-none",
          sm ? "h-2.5 w-2.5" : "h-3.5 w-3.5",
          checked ? "bg-accent-ink" : "bg-fg-mute",
          checked ? (sm ? "translate-x-[14px]" : "translate-x-[18px]") : "translate-x-[2px]",
        )}
      />
    </button>
  );
}
