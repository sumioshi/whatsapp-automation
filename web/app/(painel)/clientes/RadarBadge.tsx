"use client";

import { useEffect, useState } from "react";
import { IcRelogio } from "./icones";

interface Pendencia {
  slug: string;
  nome: string;
  horas: number;
}

/** Pílula âmbar com quantos clientes o radar vê sem resposta (fonte: /api/radar); filtra quem espera. */
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
      className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-control border border-transparent bg-warn-bg px-2.5 text-[12.5px] font-medium text-warn transition-colors hover:border-warn/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    >
      <IcRelogio className="h-3.5 w-3.5" />
      <span>
        <span className="font-mono tabular-nums">{pendencias.length}</span> sem resposta no radar
      </span>
    </button>
  );
}
