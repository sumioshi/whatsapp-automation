import type { ReactNode } from "react";
import { cn } from "./cn";

export interface CardProps {
  className?: string;
  children: ReactNode;
}

export function Card({ className = "", children }: CardProps) {
  return (
    <section className={cn("rounded-card border border-line bg-surface p-4", className)}>
      {children}
    </section>
  );
}

export interface CardHeaderProps {
  /** Título técnico (renderizado em mono uppercase). */
  title: string;
  /** Ações alinhadas à direita do cabeçalho. */
  actions?: ReactNode;
  className?: string;
}

/** Cabeçalho de card: rótulo mono uppercase à esquerda, ações à direita. */
export function CardHeader({ title, actions, className = "" }: CardHeaderProps) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <SectionLabel>{title}</SectionLabel>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Rótulo de seção em mono uppercase (text-fg-faint). */
export function SectionLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2 className={cn("mono text-[11px] uppercase tracking-wider text-fg-faint", className)}>
      {children}
    </h2>
  );
}
