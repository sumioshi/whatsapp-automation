"use client";

import { useState } from "react";
import { corDoMatiz, matizDaEtiqueta } from "@/lib/aparencia";
import { Etiqueta } from "./ui/Etiqueta";

/** Cor do ponto da etiqueta como valor CSS (use em style={{ background }}). */
export function corDoPonto(nome: string): string {
  return corDoMatiz(matizDaEtiqueta(nome));
}

export function ChipEtiqueta({ nome }: { nome: string }) {
  return <Etiqueta nome={nome} tamanho="sm" />;
}

/**
 * Editor inline: chips atuais + conhecidos (toggle) + campo pra criar nova.
 * Salva via /api/triage e devolve a lista nova pro card atualizar otimista.
 */
export function EditorEtiquetas({
  slug,
  atuais,
  conhecidas,
  onSalvo,
  onFechar,
}: {
  slug: string;
  atuais: string[];
  conhecidas: string[];
  onSalvo: (etiquetas: string[]) => void;
  onFechar: () => void;
}) {
  const [selecao, setSelecao] = useState<string[]>(atuais);
  const [nova, setNova] = useState("");
  const opcoes = [...new Set([...conhecidas, ...selecao])];

  async function salvar(lista: string[]) {
    setSelecao(lista);
    onSalvo(lista);
    await fetch("/api/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "etiquetas", slug, value: lista }),
    }).catch(() => {});
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: fecha ao clicar fora
    <div
      className="absolute top-full left-0 z-20 mt-1 w-64 rounded-card border border-line bg-surface p-2 [box-shadow:var(--float)]"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") onFechar();
      }}
    >
      <div className="mb-2 flex flex-wrap gap-1">
        {opcoes.map((et) => {
          const ativa = selecao.includes(et);
          return (
            <button
              key={et}
              type="button"
              aria-pressed={ativa}
              onClick={() => void salvar(ativa ? selecao.filter((x) => x !== et) : [...selecao, et])}
              className={`rounded-full transition-opacity ${ativa ? "" : "opacity-45 hover:opacity-80"}`}
            >
              <Etiqueta nome={et} tamanho="sm" />
            </button>
          );
        })}
        {opcoes.length === 0 && (
          <span className="text-xs text-fg-faint">nenhuma etiqueta ainda — crie abaixo</span>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const nome = nova.trim();
          if (!nome) return;
          setNova("");
          void salvar([...new Set([...selecao, nome])]);
        }}
        className="flex gap-1"
      >
        <input
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          placeholder="Nova etiqueta…"
          className="min-w-0 flex-1 rounded-control border border-line bg-surface-2 px-2 py-1 text-xs text-fg"
        />
        <button
          type="submit"
          className="rounded-control border border-line px-2 py-1 text-xs text-fg-dim hover:text-fg"
        >
          +
        </button>
      </form>
    </div>
  );
}
