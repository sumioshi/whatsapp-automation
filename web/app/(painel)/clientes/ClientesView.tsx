"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ClienteCard } from "@/lib/clientes";
import type { KanbanState } from "@/lib/kanban";
import { ClientesGrid } from "./ClientesGrid";
import { corDaEtiqueta } from "@/app/components/Etiqueta";
import { SyncWidget } from "./SyncWidget";
import { KanbanBoard } from "./KanbanBoard";

type Modo = "grade" | "kanban";
type Contexto = "trabalho" | "tudo";
const CHAVE_CTX = "wac-clientes-contexto";

/** true se o card pertence ao contexto de trabalho (padrão da tela). */
function ehTrabalho(c: ClienteCard): boolean {
  const empresas = c.etiquetas.filter((e) => e !== "Pessoal");
  if (c.etiquetas.includes("Pessoal") && empresas.length === 0) return false;
  if (c.tipo === "grupo") return true; // grupo monitorado é trabalho por definição
  return empresas.length > 0; // DM sem etiqueta de empresa = conversa solta
}
const CHAVE = "wac-clientes-modo";
/** Etiquetas sugeridas antes do primeiro uso (as em uso nos chats somam a estas). */
const SEMENTES = ["Pessoal"];

/** Alterna Grade ⇄ Kanban; a preferência fica no navegador. */
export function ClientesView({ cards, kanban }: { cards: ClienteCard[]; kanban: KanbanState }) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("grade");
  const [contexto, setContexto] = useState<Contexto>("trabalho");
  const [etiqueta, setEtiqueta] = useState<string | null>(null);

  // Mantém a tela viva: refresh de 15s, pausado com a aba oculta.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15_000);
    return () => clearInterval(id);
  }, [router]);

  const conhecidas = [
    ...new Set([...SEMENTES, ...cards.flatMap((c) => c.etiquetas)]),
  ];
  const noContexto = contexto === "trabalho" ? cards.filter(ehTrabalho) : cards;
  const visiveis = etiqueta
    ? noContexto.filter((c) => c.etiquetas.includes(etiqueta))
    : noContexto;

  useEffect(() => {
    const salvo = window.localStorage.getItem(CHAVE);
    if (salvo === "kanban") setModo("kanban");
    if (window.localStorage.getItem(CHAVE_CTX) === "tudo") setContexto("tudo");
  }, []);

  function trocarContexto(ctx: Contexto) {
    setContexto(ctx);
    window.localStorage.setItem(CHAVE_CTX, ctx);
  }

  function trocar(m: Modo) {
    setModo(m);
    window.localStorage.setItem(CHAVE, m);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-surface px-5 py-2">
        <div className="flex rounded-control border border-line bg-surface p-0.5">
          {(
            [
              ["trabalho", "Trabalho"],
              ["tudo", "Tudo"],
            ] as Array<[Contexto, string]>
          ).map(([ctx, rotulo]) => (
            <button
              key={ctx}
              type="button"
              onClick={() => trocarContexto(ctx)}
              title={ctx === "trabalho" ? "Grupos monitorados + chats com etiqueta de empresa" : "Inclui pessoal e conversas soltas"}
              className={`rounded-[6px] px-3 py-1 text-xs font-medium transition-colors ${
                contexto === ctx ? "bg-surface-2 text-fg" : "text-fg-dim hover:text-fg"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="flex rounded-control border border-line bg-surface p-0.5">
          {(
            [
              ["grade", "Grade"],
              ["kanban", "Kanban"],
            ] as Array<[Modo, string]>
          ).map(([m, rotulo]) => (
            <button
              key={m}
              type="button"
              onClick={() => trocar(m)}
              className={`rounded-[6px] px-3 py-1 text-xs font-medium transition-colors ${
                modo === m ? "bg-surface-2 text-fg" : "text-fg-dim hover:text-fg"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <span className="mx-1 h-4 w-px bg-line" />
        {conhecidas.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEtiqueta((atual) => (atual === e ? null : e))}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-opacity ${corDaEtiqueta(e)} ${
              etiqueta === null || etiqueta === e ? "" : "opacity-35 hover:opacity-70"
            }`}
          >
            {e}
          </button>
        ))}
        {modo === "kanban" && (
          <span className="mono text-[10px] text-fg-faint">
            arraste os cards entre colunas · duplo clique renomeia
          </span>
        )}
        <SyncWidget />
      </div>
      {modo === "grade" ? (
        <ClientesGrid cards={visiveis} conhecidas={conhecidas} />
      ) : (
        <KanbanBoard cards={visiveis} inicial={kanban} conhecidas={conhecidas} />
      )}
    </div>
  );
}
