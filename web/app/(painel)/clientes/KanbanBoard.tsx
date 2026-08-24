"use client";

import { useState } from "react";
import type { ClienteCard } from "@/lib/clientes";
import { colunaDoCartao, type KanbanState } from "@/lib/kanban";
import { CardCliente } from "./ClientesGrid";

async function postKanban(body: Record<string, unknown>): Promise<KanbanState | null> {
  try {
    const res = await fetch("/api/kanban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { state?: KanbanState };
    return data.state ?? null;
  } catch {
    return null;
  }
}

/** Board de colunas do operador; arrastar um card muda a coluna do chat. */
export function KanbanBoard({
  cards,
  inicial,
  conhecidas = [],
}: {
  cards: ClienteCard[];
  inicial: KanbanState;
  conhecidas?: string[];
}) {
  // Otimista: aplica local na hora e reconcilia com a resposta do servidor.
  const [kanban, setKanban] = useState<KanbanState>(inicial);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const porColuna = new Map<string, ClienteCard[]>();
  for (const col of kanban.colunas) porColuna.set(col.id, []);
  for (const c of cards) {
    porColuna.get(colunaDoCartao(kanban, c.slug))?.push(c);
  }

  async function aplicar(otimista: KanbanState, body: Record<string, unknown>) {
    setKanban(otimista);
    const real = await postKanban(body);
    if (real) setKanban(real);
  }

  function soltar(colunaId: string) {
    if (!arrastando) return;
    const cartoes = { ...kanban.cartoes };
    if (colunaId === kanban.colunas[0]?.id) delete cartoes[arrastando];
    else cartoes[arrastando] = colunaId;
    void aplicar({ ...kanban, cartoes }, { acao: "mover", slug: arrastando, colunaId });
    setArrastando(null);
    setSobre(null);
  }

  return (
    <div className="flex flex-1 gap-3 overflow-x-auto px-4 py-5 md:px-8">
      {kanban.colunas.map((col) => {
        const itens = porColuna.get(col.id) ?? [];
        if (col.recolhida) {
          return (
            <button
              key={col.id}
              type="button"
              title={`Expandir "${col.nome}" (${itens.length})`}
              onClick={() =>
                void aplicar(
                  {
                    ...kanban,
                    colunas: kanban.colunas.map((c) =>
                      c.id === col.id ? { ...c, recolhida: false } : c,
                    ),
                  },
                  { acao: "recolher", colunaId: col.id, recolhida: false },
                )
              }
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => soltar(col.id)}
              className="flex w-9 shrink-0 flex-col items-center gap-2 rounded-card border border-line bg-surface py-3 text-fg-dim transition-colors hover:text-fg"
            >
              <span className="mono text-[10px]">{itens.length}</span>
              <span className="text-xs font-medium [writing-mode:vertical-rl]">{col.nome}</span>
            </button>
          );
        }
        return (
          <section
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setSobre(col.id);
            }}
            onDragLeave={() => setSobre((s) => (s === col.id ? null : s))}
            onDrop={() => soltar(col.id)}
            className={`flex w-80 shrink-0 flex-col rounded-card border bg-surface/60 ${
              sobre === col.id && arrastando ? "border-accent/50" : "border-line"
            }`}
          >
            <header className="flex items-center gap-2 border-b border-line px-3 py-2">
              {renomeando === col.id ? (
                <input
                  defaultValue={col.nome}
                  autoFocus
                  onBlur={(e) => {
                    setRenomeando(null);
                    const nome = e.target.value.trim();
                    if (nome && nome !== col.nome)
                      void aplicar(
                        {
                          ...kanban,
                          colunas: kanban.colunas.map((c) =>
                            c.id === col.id ? { ...c, nome } : c,
                          ),
                        },
                        { acao: "renomear", colunaId: col.id, nome },
                      );
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenomeando(null);
                  }}
                  className="w-full rounded-control border border-line bg-surface px-2 py-0.5 text-sm text-fg"
                />
              ) : (
                <button
                  type="button"
                  onDoubleClick={() => setRenomeando(col.id)}
                  title="Duplo clique para renomear"
                  className="truncate text-sm font-semibold text-fg"
                >
                  {col.nome}
                </button>
              )}
              <span className="mono text-[10px] text-fg-faint">{itens.length}</span>
              <span className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  title="Recolher coluna"
                  onClick={() =>
                    void aplicar(
                      {
                        ...kanban,
                        colunas: kanban.colunas.map((c) =>
                          c.id === col.id ? { ...c, recolhida: true } : c,
                        ),
                      },
                      { acao: "recolher", colunaId: col.id, recolhida: true },
                    )
                  }
                  className="rounded-control px-1.5 py-0.5 text-xs text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  ⌄
                </button>
                {kanban.colunas.length > 1 && itens.length === 0 && (
                  <button
                    type="button"
                    title="Excluir coluna vazia"
                    onClick={() =>
                      void aplicar(
                        {
                          ...kanban,
                          colunas: kanban.colunas.filter((c) => c.id !== col.id),
                        },
                        { acao: "excluir", colunaId: col.id },
                      )
                    }
                    className="rounded-control px-1.5 py-0.5 text-xs text-fg-faint transition-colors hover:bg-surface-2 hover:text-danger"
                  >
                    ×
                  </button>
                )}
              </span>
            </header>
            <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2">
              {itens.map((c) => (
                <div
                  key={c.slug}
                  draggable
                  onDragStart={() => setArrastando(c.slug)}
                  onDragEnd={() => {
                    setArrastando(null);
                    setSobre(null);
                  }}
                  className={arrastando === c.slug ? "opacity-40" : ""}
                >
                  <CardCliente c={c} conhecidas={conhecidas} />
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {criando ? (
        <input
          autoFocus
          placeholder="Nome da coluna…"
          onBlur={(e) => {
            const nome = e.target.value.trim();
            setCriando(false);
            if (nome)
              void aplicar(
                { ...kanban, colunas: [...kanban.colunas, { id: `tmp-${nome}`, nome }] },
                { acao: "criar", nome },
              );
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setCriando(false);
          }}
          className="h-10 w-40 shrink-0 self-start rounded-card border border-line bg-surface px-3 text-sm text-fg"
        />
      ) : (
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="h-10 w-40 shrink-0 self-start rounded-card border border-dashed border-line text-sm text-fg-dim transition-colors hover:border-line-2 hover:text-fg"
        >
          + Coluna
        </button>
      )}
    </div>
  );
}
