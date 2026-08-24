"use client";

import { useState } from "react";

/** Paleta fixa; a cor de uma etiqueta é determinística pelo nome. */
const CORES = [
  "border-sky-500/40 bg-sky-500/10 text-sky-300",
  "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  "border-amber-500/40 bg-amber-500/10 text-amber-300",
  "border-pink-500/40 bg-pink-500/10 text-pink-300",
  "border-violet-500/40 bg-violet-500/10 text-violet-300",
  "border-orange-500/40 bg-orange-500/10 text-orange-300",
];

const PONTOS = [
  "bg-sky-400",
  "bg-emerald-400",
  "bg-amber-400",
  "bg-pink-400",
  "bg-violet-400",
  "bg-orange-400",
];

/** Cor de ponto (bg puro) da etiqueta — pro indicador compacto da sidebar. */
export function corDoPonto(nome: string): string {
  let h = 0;
  for (const ch of nome) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return PONTOS[h % PONTOS.length] as string;
}

export function corDaEtiqueta(nome: string): string {
  let h = 0;
  for (const ch of nome) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return CORES[h % CORES.length] as string;
}

export function ChipEtiqueta({ nome }: { nome: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-px text-[10px] font-medium ${corDaEtiqueta(nome)}`}
    >
      {nome}
    </span>
  );
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
      className="absolute top-full left-0 z-20 mt-1 w-64 rounded-card border border-line bg-surface p-2 shadow-lg"
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
              onClick={() => void salvar(ativa ? selecao.filter((x) => x !== et) : [...selecao, et])}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-opacity ${corDaEtiqueta(et)} ${
                ativa ? "" : "opacity-40 hover:opacity-80"
              }`}
            >
              {et}
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
