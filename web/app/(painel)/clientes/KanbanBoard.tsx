"use client";

import { useState } from "react";
import { corDoPonto } from "@/app/components/Etiqueta";
import { cn } from "@/app/components/ui";
import type { ClienteCard } from "@/lib/clientes";
import { colunaDoCartao, type KanbanState } from "@/lib/kanban";
import { CartaoCliente } from "./CartaoCliente";
import { IcFechar, IcMais, IcSetaBaixo } from "./icones";

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

const ACAO_COLUNA =
  "grid h-7 w-7 place-items-center rounded-control text-fg-faint transition-colors hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-accent";

/** Quadro de colunas do operador; arrastar um cartão muda a coluna do chat. */
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
  // Raia virtual: estado computado ao vivo, nunca gravado — cartão respondido
  // sai sozinho. A coluna manual do cartão permanece (mostrada embaixo dele).
  const aguardando = cards
    .filter((c) => c.aguardando && !c.silenciado)
    .sort((a, b) => b.waitingMs - a.waitingMs);
  const nomeColuna = new Map(kanban.colunas.map((c) => [c.id, c.nome]));

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
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-bg">
      {aguardando.length > 0 && (
        <section aria-label="Esperando resposta" className="border-b border-line px-8 py-4 max-[860px]:px-4">
          <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-fg">
            <span aria-hidden className="h-2 w-2 rounded-full bg-warn-mark" />
            Esperando resposta
            <span className="font-mono text-[12px] font-normal tabular-nums text-fg-faint">{aguardando.length}</span>
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {aguardando.map((c) => (
              <div key={c.slug} className="w-72 shrink-0">
                <CartaoCliente c={c} conhecidas={conhecidas} editarEtiquetas={false} />
                <p className="mt-1 px-1 text-[11.5px] text-fg-faint">
                  na coluna {nomeColuna.get(colunaDoCartao(kanban, c.slug)) ?? "Entrada"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="flex min-h-[60vh] flex-1 gap-4 overflow-x-auto px-8 py-5 max-[860px]:px-4">
        {kanban.colunas.map((col) => {
          const itens = porColuna.get(col.id) ?? [];
          if (col.recolhida) {
            return (
              <button
                key={col.id}
                type="button"
                title={`Abrir a coluna "${col.nome}" (${itens.length})`}
                onClick={() =>
                  void aplicar(
                    {
                      ...kanban,
                      colunas: kanban.colunas.map((c) => (c.id === col.id ? { ...c, recolhida: false } : c)),
                    },
                    { acao: "recolher", colunaId: col.id, recolhida: false },
                  )
                }
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => soltar(col.id)}
                className="flex w-10 shrink-0 flex-col items-center gap-2 self-start rounded-card border border-line bg-surface-2 py-3 text-fg-dim transition-colors hover:border-line-2 hover:text-fg"
              >
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: corDoPonto(col.nome) }} />
                <span className="font-mono text-[11px] tabular-nums">{itens.length}</span>
                <span className="text-[12.5px] font-medium [writing-mode:vertical-rl]">{col.nome}</span>
              </button>
            );
          }
          return (
            <section
              key={col.id}
              aria-label={`Coluna ${col.nome}`}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(col.id);
              }}
              onDragLeave={() => setSobre((s) => (s === col.id ? null : s))}
              onDrop={() => soltar(col.id)}
              className={cn(
                "group/col flex w-72 shrink-0 flex-col rounded-card p-1.5 transition-colors",
                sobre === col.id && arrastando ? "bg-accent-soft outline-1 outline-dashed outline-accent-line" : "bg-surface-2/70",
              )}
            >
              <header className="flex min-h-9 items-center gap-2 px-1.5 pb-1.5">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: corDoPonto(col.nome) }} />
                {renomeando === col.id ? (
                  <input
                    defaultValue={col.nome}
                    autoFocus
                    aria-label="Nome da coluna"
                    onBlur={(e) => {
                      setRenomeando(null);
                      const nome = e.target.value.trim();
                      if (nome && nome !== col.nome)
                        void aplicar(
                          { ...kanban, colunas: kanban.colunas.map((c) => (c.id === col.id ? { ...c, nome } : c)) },
                          { acao: "renomear", colunaId: col.id, nome },
                        );
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setRenomeando(null);
                    }}
                    className="h-7 w-full rounded-control border border-line-2 bg-surface px-2 text-[13px] text-fg focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
                  />
                ) : (
                  <button
                    type="button"
                    onDoubleClick={() => setRenomeando(col.id)}
                    title="Clique duas vezes para renomear"
                    className="truncate text-[13px] font-semibold text-fg"
                  >
                    {col.nome}
                  </button>
                )}
                <span className="font-mono text-[12px] tabular-nums text-fg-faint">{itens.length}</span>
                <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/col:opacity-100">
                  <button
                    type="button"
                    title="Recolher coluna"
                    aria-label={`Recolher a coluna ${col.nome}`}
                    onClick={() =>
                      void aplicar(
                        {
                          ...kanban,
                          colunas: kanban.colunas.map((c) => (c.id === col.id ? { ...c, recolhida: true } : c)),
                        },
                        { acao: "recolher", colunaId: col.id, recolhida: true },
                      )
                    }
                    className={ACAO_COLUNA}
                  >
                    <IcSetaBaixo className="h-3.5 w-3.5" />
                  </button>
                  {kanban.colunas.length > 1 && itens.length === 0 && (
                    <button
                      type="button"
                      title="Excluir coluna vazia"
                      aria-label={`Excluir a coluna vazia ${col.nome}`}
                      onClick={() =>
                        void aplicar(
                          { ...kanban, colunas: kanban.colunas.filter((c) => c.id !== col.id) },
                          { acao: "excluir", colunaId: col.id },
                        )
                      }
                      className={cn(ACAO_COLUNA, "hover:text-danger")}
                    >
                      <IcFechar className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </header>
              <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-0.5 pb-1">
                {itens.length === 0 && (
                  <p className="rounded-control border border-dashed border-line-2 px-3 py-4 text-center text-[12.5px] text-fg-faint">
                    Arraste um cliente para cá
                  </p>
                )}
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
                    <CartaoCliente c={c} conhecidas={conhecidas} />
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
            aria-label="Nome da nova coluna"
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
            className="h-10 w-48 shrink-0 self-start rounded-card border border-line-2 bg-surface px-3 text-[13px] text-fg focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
          />
        ) : (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="inline-flex h-10 w-48 shrink-0 items-center justify-center gap-1.5 self-start rounded-card border border-dashed border-line-2 text-[13px] text-fg-dim transition-colors hover:border-fg-mute hover:text-fg"
          >
            <IcMais className="h-3.5 w-3.5" />
            Coluna
          </button>
        )}
      </div>
    </div>
  );
}
