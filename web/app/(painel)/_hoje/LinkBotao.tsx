import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/app/components/ui";

/** Mesmas variantes do `Button` (tinta para a ação principal, borda para a comum), para navegação. */
const VARIANTES = {
  tinta: "border border-ink bg-ink text-on-ink hover:bg-ink/85",
  comum: "border border-line-2 bg-surface text-fg hover:border-fg-mute hover:bg-elevated",
} as const;

const TAMANHOS = {
  sm: "h-7 gap-1.5 px-2.5 text-[12.5px]",
  md: "h-8 gap-1.5 px-3 text-[13px]",
} as const;

export function LinkBotao({
  href,
  children,
  variante = "comum",
  tamanho = "md",
  className,
}: {
  href: string;
  children: ReactNode;
  variante?: keyof typeof VARIANTES;
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-control font-medium leading-none",
        "transition-[background-color,border-color] duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        VARIANTES[variante],
        TAMANHOS[tamanho],
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Link do rodapé do card ("Ver na caixa"): acento, à direita. */
export function LinkRodape({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="ml-auto shrink-0 font-medium text-accent hover:underline">
      {children}
    </Link>
  );
}
