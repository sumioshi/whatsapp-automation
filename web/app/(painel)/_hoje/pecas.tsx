import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/app/components/ui";

/** Linha de lista dos cards (52 px, borda entre as linhas); com href, a linha é um link. */
export function Linha({ href, className, children }: { href?: string; className?: string; children: ReactNode }) {
  const cls = cn("flex min-h-[52px] items-center gap-3 border-b border-line text-fg last:border-b-0", className);
  return href ? (
    <Link href={href} className={cn("group", cls)}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}

/** Nome em negrito leve e o apoio embaixo, cortando com reticências. */
export function Texto({ titulo, apoio, destaque }: { titulo: ReactNode; apoio?: ReactNode; destaque?: boolean }) {
  return (
    <span className="min-w-0 flex-1">
      <b
        className={cn(
          "flex items-center gap-2 overflow-hidden whitespace-nowrap font-medium group-hover:text-accent",
          destaque ? "text-accent" : "text-fg",
        )}
      >
        {titulo}
      </b>
      {apoio !== undefined && <small className="mt-px block truncate text-[12.5px] text-fg-faint">{apoio}</small>}
    </span>
  );
}

/** Estado vazio dentro do corpo do card: o que está acontecendo e o próximo passo. */
export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1.5 px-4 text-center">
      <p className="text-[13.5px] font-medium text-fg-dim">{titulo}</p>
      {children && <div className="max-w-[44ch] text-[12.5px] leading-relaxed text-fg-faint">{children}</div>}
    </div>
  );
}
