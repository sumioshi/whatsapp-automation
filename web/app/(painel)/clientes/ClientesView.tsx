"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ClienteCard } from "@/lib/clientes";
import type { KanbanState } from "@/lib/kanban";
import { ClientesGrid } from "./ClientesGrid";
import { Etiqueta } from "@/app/components/ui";
import { MetricasResumo } from "./MetricasResumo";
import { RadarBadge } from "./RadarBadge";
import { SyncWidget } from "./SyncWidget";
import { KanbanBoard } from "./KanbanBoard";

type Modo = "grade" | "kanban";
type Filtro = "todos" | "aguardando" | "grupos" | "dms";

const FILTROS: Array<{ id: Filtro; rotulo: string }> = [
  { id: "todos", rotulo: "Todos" },
  { id: "aguardando", rotulo: "Aguardando" },
  { id: "grupos", rotulo: "Grupos" },
  { id: "dms", rotulo: "DMs" },
];
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
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
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
  const q = busca.trim().toLowerCase();
  const visiveis = (contexto === "trabalho" ? cards.filter(ehTrabalho) : cards).filter((c) => {
    if (filtro === "aguardando" && !c.aguardando) return false;
    if (filtro === "grupos" && c.tipo !== "grupo") return false;
    if (filtro === "dms" && c.tipo !== "dm") return false;
    if (etiqueta && !c.etiquetas.includes(etiqueta)) return false;
    if (q && !c.nome.toLowerCase().includes(q)) return false;
    return true;
  });

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
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-5 py-2">
        {/* busca — primeiro porque é a ação mais frequente */}
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar…"
          aria-label="Buscar cliente pelo nome"
          className="w-52 rounded-[6px] border border-line bg-transparent px-2.5 py-1 text-sm text-fg placeholder:text-fg-faint focus:border-line-2 focus:outline-none"
        />

        <div className="flex rounded-[6px] border border-line p-0.5">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={`rounded-[5px] px-2.5 py-0.5 text-xs font-medium transition-colors ${
                filtro === f.id ? "bg-surface-2 text-fg" : "text-fg-dim hover:text-fg"
              }`}
            >
              {f.rotulo}
            </button>
          ))}
        </div>

        {conhecidas.map((e) => (
          <button
            key={e}
            type="button"
            aria-pressed={etiqueta === e}
            onClick={() => setEtiqueta((atual) => (atual === e ? null : e))}
            className={`rounded-full transition-opacity ${
              etiqueta === null || etiqueta === e ? "" : "opacity-35 hover:opacity-70"
            }`}
          >
            <Etiqueta nome={e} />
          </button>
        ))}

        <span className="ml-auto flex items-center gap-2">
          <div className="flex rounded-[6px] border border-line p-0.5">
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
                className={`rounded-[5px] px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  contexto === ctx ? "bg-surface-2 text-fg" : "text-fg-dim hover:text-fg"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <div className="flex rounded-[6px] border border-line p-0.5">
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
                className={`rounded-[5px] px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  modo === m ? "bg-surface-2 text-fg" : "text-fg-dim hover:text-fg"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <RadarBadge onClick={() => setFiltro("aguardando")} />
          <SyncWidget />
        </span>
      </div>

      <MetricasResumo />

      {modo === "grade" ? (
        <ClientesGrid cards={visiveis} conhecidas={conhecidas} />
      ) : (
        <KanbanBoard cards={visiveis} inicial={kanban} conhecidas={conhecidas} />
      )}
    </div>
  );
}
