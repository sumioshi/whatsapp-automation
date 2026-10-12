import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** Próximo passo (botão ou link) logo abaixo da descrição. */
  acao?: ReactNode;
  className?: string;
}

/** Estado vazio centralizado: ícone, título, o que fazer agora e, se houver, a ação. */
export function EmptyState({ icon, title, description, acao, className = "" }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-12 text-center", className)}>
      {icon && <div className="mb-3 text-fg-faint">{icon}</div>}
      <p className="text-[14px] font-medium text-fg">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-fg-faint">{description}</p>
      )}
      {acao && <div className="mt-4 flex flex-wrap justify-center gap-2">{acao}</div>}
    </div>
  );
}
