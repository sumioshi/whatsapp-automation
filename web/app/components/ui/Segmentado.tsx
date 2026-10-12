"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

export interface OpcaoSegmentada<T extends string> {
  valor: T;
  rotulo: ReactNode;
  /** Contagem discreta ao lado do rótulo ("Esperando 7"). */
  num?: number | string;
  /** Com href, a opção é um link (filtro na URL) em vez de botão. */
  href?: string;
}

export interface SegmentadoProps<T extends string> {
  opcoes: OpcaoSegmentada<T>[];
  valor: T;
  aoMudar?: (valor: T) => void;
  /** Nome do grupo para leitor de tela ("Filtrar conversas", "Período"). */
  rotulo: string;
  className?: string;
}

const OPCAO =
  "inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

/** Escolha exclusiva entre poucas vistas: filtro da fila, Tabela/Quadro, período do Painel. */
export function Segmentado<T extends string>({ opcoes, valor, aoMudar, rotulo, className }: SegmentadoProps<T>) {
  return (
    <div role="group" aria-label={rotulo} className={cn("inline-flex gap-0.5 self-start rounded-control bg-elevated p-0.5", className)}>
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        const cls = cn(OPCAO, ativo ? "bg-surface text-fg shadow-[0_0_0_1px_var(--color-line)]" : "text-fg-dim hover:text-fg");
        const conteudo = (
          <>
            {o.rotulo}
            {o.num !== undefined && <span className="font-mono text-[11px] tabular-nums text-fg-faint">{o.num}</span>}
          </>
        );
        return o.href ? (
          <Link key={o.valor} href={o.href} aria-current={ativo ? "page" : undefined} className={cls}>
            {conteudo}
          </Link>
        ) : (
          <button key={o.valor} type="button" aria-pressed={ativo} onClick={() => aoMudar?.(o.valor)} className={cls}>
            {conteudo}
          </button>
        );
      })}
    </div>
  );
}
