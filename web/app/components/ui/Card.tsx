import type { ReactNode } from "react";
import { cn } from "./cn";

type Largura = "p" | "g" | "inteiro";
type Altura = "livre" | "compacta" | "padrao";

/** Três larguras na grade de 12 (P = 4, G = 8, inteiro = 12); abaixo de 1020 px tudo ocupa a linha. */
const LARGURA: Record<Largura, string> = {
  p: "col-span-4 max-[1020px]:col-span-full",
  g: "col-span-8 max-[1020px]:col-span-full",
  inteiro: "col-span-full",
};

/** Duas alturas fixas de corpo para cards lado a lado alinharem sempre. */
const ALTURA: Record<Altura, string> = {
  livre: "",
  compacta: "h-[84px] max-[1020px]:h-auto",
  padrao: "h-[268px] overflow-hidden max-[1020px]:h-auto max-[1020px]:min-h-[220px]",
};

export interface CardProps {
  className?: string;
  children: ReactNode;
  /** Com título, o card usa a moldura do Balcão: cabeçalho, corpo e rodapé opcional. */
  titulo?: ReactNode;
  icone?: ReactNode;
  meta?: ReactNode;
  acoes?: ReactNode;
  rodape?: ReactNode;
  largura?: Largura;
  altura?: Altura;
}

export function Card({ className = "", children, titulo, icone, meta, acoes, rodape, largura, altura = "livre" }: CardProps) {
  const base = cn(
    "min-w-0 rounded-card border border-line bg-surface [box-shadow:var(--shadow-card)]",
    largura && LARGURA[largura],
  );
  if (titulo === undefined) {
    return <section className={cn(base, "p-4", className)}>{children}</section>;
  }
  return (
    <section className={cn(base, "flex flex-col", className)}>
      <header className="flex min-h-[52px] shrink-0 items-center gap-2 px-5">
        {icone && <span className="shrink-0 text-fg-faint [&>svg]:h-4 [&>svg]:w-4">{icone}</span>}
        <h3 className="text-[14.5px] font-semibold tracking-[-0.006em] text-fg">{titulo}</h3>
        {meta && <span className="truncate text-[12.5px] text-fg-faint">{meta}</span>}
        {acoes && <div className="ml-auto flex items-center gap-2">{acoes}</div>}
      </header>
      <div className={cn("min-h-0 flex-1 px-5 pb-5", ALTURA[altura])}>{children}</div>
      {rodape && (
        <footer className="flex min-h-11 items-center gap-2 border-t border-line px-5 text-[12.5px] text-fg-faint">
          {rodape}
        </footer>
      )}
    </section>
  );
}

/** Grade de 12 colunas com 20 px entre cards; vira uma coluna abaixo de 1020 px. */
export function Grade12({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-12 gap-5 max-[1020px]:grid-cols-1", className)}>{children}</div>;
}

export interface CardHeaderProps {
  title: string;
  actions?: ReactNode;
  className?: string;
}

/** Cabeçalho simples para cards antigos: rótulo à esquerda, ações à direita. */
export function CardHeader({ title, actions, className = "" }: CardHeaderProps) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <SectionLabel>{title}</SectionLabel>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Rótulo de seção em texto normal (sem caixa alta), peso 600. */
export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("text-[12.5px] font-semibold text-fg-dim", className)}>{children}</h2>;
}
