import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  className?: string;
}

/** Estado vazio centralizado (ícone/título/descrição). */
export function EmptyState({ icon, title, description, className = "" }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-12 text-center", className)}>
      {icon && <div className="mb-3 text-fg-faint">{icon}</div>}
      <p className="mono text-sm text-fg-dim">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-fg-faint">{description}</p>
      )}
    </div>
  );
}
