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
 * Switch on/off — Signal Room.
 *
 * Anatomia: trilho (track) + knob.
 * ON  → trilho ember com glow contido, knob branco com sombra.
 * OFF → trilho surface-2 com borda hairline, knob fg-dim.
 *
 * Referências:
 *   • Three.tools "midnight command center" — ember exclusivo no estado ativo, sem cor no off.
 *   • Linear Changelog — profundidade por tonal shift, sem sombras pesadas.
 *   • Kraken Pro / Xbox settings — trilho+knob com thumb deslocado, ON=accent, OFF=muted gray.
 *   • Signal Room globals.css — shadow-pressable, focus-ring, ease-out-quint.
 */
export function Toggle({
  checked,
  onChange,
  disabled,
  "aria-label": ariaLabel,
  className = "",
  size = "md",
}: ToggleProps) {
  const isSm = size === "sm";

  /* ── dimensões ──────────────────────────────────────────────────────── */
  // track
  const trackW = isSm ? "w-8"  : "w-10";
  const trackH = isSm ? "h-4"  : "h-[22px]";

  // knob: fica com 2 px de inset em cima/baixo → knob = track-h - 4 px
  const knobSize   = isSm ? "h-3 w-3"      : "h-[14px] w-[14px]";
  // deslocamento: OFF = translate-x-[3px], ON = track-width - knob - 3px
  const knobOff    = "translate-x-[3px]";
  const knobOn     = isSm ? "translate-x-[17px]" : "translate-x-[23px]";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        // layout base — min touch 44 × 44 via padding invisível
        "focus-ring group relative inline-flex shrink-0 cursor-pointer select-none items-center rounded-full",
        "p-0 focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40",
        trackW,
        trackH,
        /* ── trilho OFF ── */
        !checked && "border border-line-2 bg-surface-2 [box-shadow:inset_0_1px_2px_rgba(0,0,0,0.45)]",
        /* ── trilho ON ── */
        checked && "border border-accent/40 bg-accent [box-shadow:0_0_0_1px_color-mix(in_oklab,var(--color-accent)_30%,transparent),0_0_8px_-2px_color-mix(in_oklab,var(--color-accent)_55%,transparent),inset_0_1px_0_rgba(255,255,255,0.18)]",
        // transição do trilho
        "transition-[background-color,border-color,box-shadow] duration-[160ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute rounded-full",
          knobSize,
          /* ── knob OFF ── */
          !checked && "bg-fg-dim [box-shadow:0_1px_2px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]",
          /* ── knob ON ── */
          checked && "bg-white [box-shadow:0_1px_3px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.5)]",
          // deslocamento
          checked ? knobOn : knobOff,
          // transição suave do knob
          "transition-transform duration-[160ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
          // reduced-motion: apenas a cor muda, sem slide
          "motion-reduce:transition-none",
        )}
      />
    </button>
  );
}
