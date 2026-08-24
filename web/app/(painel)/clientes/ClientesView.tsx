"use client";

import { useEffect, useState } from "react";
import type { ClienteCard } from "@/lib/clientes";
import type { KanbanState } from "@/lib/kanban";
import { ClientesGrid } from "./ClientesGrid";
import { KanbanBoard } from "./KanbanBoard";

type Modo = "grade" | "kanban";
const CHAVE = "wac-clientes-modo";

/** Alterna Grade ⇄ Kanban; a preferência fica no navegador. */
export function ClientesView({ cards, kanban }: { cards: ClienteCard[]; kanban: KanbanState }) {
  const [modo, setModo] = useState<Modo>("grade");

  useEffect(() => {
    const salvo = window.localStorage.getItem(CHAVE);
    if (salvo === "kanban") setModo("kanban");
  }, []);

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
        {modo === "kanban" && (
          <span className="mono text-[10px] text-fg-faint">
            arraste os cards entre colunas · duplo clique renomeia
          </span>
        )}
      </div>
      {modo === "grade" ? (
        <ClientesGrid cards={cards} />
      ) : (
        <KanbanBoard cards={cards} inicial={kanban} />
      )}
    </div>
  );
}
