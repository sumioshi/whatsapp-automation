import type { ReactNode } from "react";
import { cn } from "./cn";

export interface CabecalhoPaginaProps {
  titulo: ReactNode;
  /** "pagina": uma frase sobre o estado da tela. "barra": contagem ou contexto curto ao lado do título. */
  subtitulo?: ReactNode;
  /** Botões e controles à direita. */
  acoes?: ReactNode;
  /**
   * "pagina": título grande no topo de telas de leitura (Hoje, Painel), dentro do padding da página.
   * "barra": faixa de 64 px com borda embaixo, presa no topo de telas de trabalho que rolam por
   * baixo (Clientes, Agenda, Configurações).
   */
  variante?: "pagina" | "barra";
  className?: string;
}

export function CabecalhoPagina({ titulo, subtitulo, acoes, variante = "pagina", className }: CabecalhoPaginaProps) {
  if (variante === "barra") {
    return (
      <header
        className={cn(
          "flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-line bg-bg px-8 py-3 max-[860px]:px-4",
          className,
        )}
      >
        <h1 className="whitespace-nowrap font-title text-[24px] font-medium leading-[1.1] tracking-[-0.01em] text-fg">
          {titulo}
        </h1>
        {subtitulo && <span className="min-w-0 truncate text-[13px] text-fg-faint">{subtitulo}</span>}
        {acoes && <div className="ml-auto flex flex-wrap items-center gap-2">{acoes}</div>}
      </header>
    );
  }
  return (
    <header className={cn("flex flex-wrap items-end gap-x-4 gap-y-3 pb-1", className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-balance font-title text-[32px] font-medium leading-[1.1] tracking-[-0.015em] text-fg max-[860px]:text-[26px]">
          {titulo}
        </h1>
        {subtitulo && <p className="mt-2 max-w-[62ch] text-[14px] text-fg-dim">{subtitulo}</p>}
      </div>
      {acoes && <div className="ml-auto flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  );
}
