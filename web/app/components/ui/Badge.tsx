import type { ReactNode } from "react";
import { cn } from "./cn";

type Variant = "accent" | "neutral" | "ok" | "danger" | "info";

/**
 * Pílula compacta para status / tags.
 *
 * Regras de cor por papel:
 *   accent  — ember: você, item ativo, menção a você, ação primária.
 *   neutral — graphite muted: label genérico, categoria inerte.
 *   ok      — verde semântico: conexão ativa, status saudável.
 *   danger  — vermelho: erro, desconectado, destrutivo.
 *   info    — azul: remetente, menção a terceiros, handle.
 *
 * Tipografia: .mono (Geist Mono, tracking -0.02em, tnum) em uppercase 10 px.
 * Borda hairline translúcida + tint de fundo leve — sem fill sólido.
 *
 * Prop opcional `dot` para indicador de status com ponto colorido à esquerda.
 */

const VARIANTS: Record<Variant, string> = {
  accent:  "border-accent/35  bg-accent/10  text-accent",
  neutral: "border-line       bg-surface-2  text-fg-dim",
  ok:      "border-ok/35      bg-ok/10      text-ok",
  danger:  "border-danger/35  bg-danger/10  text-danger",
  info:    "border-info/35    bg-info/10    text-info",
};

const DOT_COLORS: Record<Variant, string> = {
  accent:  "bg-accent",
  neutral: "bg-fg-faint",
  ok:      "bg-ok",
  danger:  "bg-danger",
  info:    "bg-info",
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
        "mono inline-flex items-center gap-1 rounded-full border",
        "px-2 py-0.5 text-[10px] uppercase tracking-wide",
        // transição suave de cor (ex.: badge de status que muda de ok → danger)
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
