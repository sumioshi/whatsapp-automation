"use client";

import { useEffect, useState } from "react";

interface Pendencia {
  slug: string;
  nome: string;
  horas: number;
}

/** Pill âmbar com o nº de clientes aguardando resposta (fonte: /api/radar). */
export function RadarBadge({ onClick }: { onClick?: () => void }) {
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    let vivo = true;
    // A 1ª carga roda sempre; só o refresh periódico pausa com a aba escondida.
    async function carregar(inicial = false) {
      if (!inicial && document.hidden) return;
      try {
        const r = await fetch("/api/radar", { cache: "no-store" });
        const d = (await r.json()) as {
          status?: { pendencias?: Pendencia[] } | null;
          config?: { ativo?: boolean };
        };
        if (!vivo) return;
        setAtivo(Boolean(d.config?.ativo));
        setPendencias(d.status?.pendencias ?? []);
      } catch {
        /* painel/coletor reiniciando */
      }
    }
    void carregar(true);
    const id = setInterval(() => void carregar(), 60_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);

  if (!ativo || pendencias.length === 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title={pendencias.map((p) => `${p.nome} (${p.horas}h)`).join(" · ")}
      className="pressable inline-flex items-center gap-1.5 rounded-control border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/15"
    >
      <span aria-hidden>⏰</span>
      {pendencias.length} aguardando
    </button>
  );
}
