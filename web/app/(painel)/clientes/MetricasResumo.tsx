"use client";

import { useEffect, useState } from "react";
import type { Metricas } from "@/lib/metricas";

type Janela = Metricas["janela"];
const JANELAS: Array<{ id: Janela; rotulo: string }> = [
  { id: "24h", rotulo: "24h" },
  { id: "7d", rotulo: "7 dias" },
  { id: "30d", rotulo: "30 dias" },
];
const CHAVE_JANELA = "wac-metricas-janela";
const CHAVE_ABERTO = "wac-metricas-aberto";
const TOP = 10;

function Cartao({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe: string | null }) {
  return (
    <div className="rounded-card border border-line bg-surface px-3 py-2">
      <div className="mono text-[10px] uppercase tracking-wider text-fg-faint">{titulo}</div>
      <div className="truncate text-sm text-fg">{valor}</div>
      {detalhe && <div className="mono truncate text-[11px] text-fg-dim">{detalhe}</div>}
    </div>
  );
}

/**
 * Quem mais fala, quem parou de falar. Dados de /api/metricas, janela escolhida pelo usuário.
 * Barra do ranking: preenchimento em fg-dim sobre trilho surface-2 — é uma métrica única (não
 * categórica), então a cor segue o formulário de "meter" (traço legível sobre trilho na mesma
 * família), não a paleta de identidade; o accent fica reservado pra sinalização (ver RadarBadge).
 */
export function MetricasResumo() {
  const [janela, setJanela] = useState<Janela>("7d");
  const [aberto, setAberto] = useState(true);
  const [dados, setDados] = useState<Metricas | null>(null);

  useEffect(() => {
    try {
      const j = window.localStorage.getItem(CHAVE_JANELA);
      if (j === "24h" || j === "7d" || j === "30d") setJanela(j);
      if (window.localStorage.getItem(CHAVE_ABERTO) === "0") setAberto(false);
    } catch {
      /* sem storage */
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/metricas?janela=${janela}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((m: Metricas) => { if (vivo) setDados(m); })
      .catch(() => { if (vivo) setDados(null); });
    return () => { vivo = false; };
  }, [janela]);

  function trocarJanela(j: Janela) {
    setJanela(j);
    try { window.localStorage.setItem(CHAVE_JANELA, j); } catch { /* sem storage */ }
  }
  function alternar() {
    setAberto((a) => {
      try { window.localStorage.setItem(CHAVE_ABERTO, a ? "0" : "1"); } catch { /* sem storage */ }
      return !a;
    });
  }

  const top = dados?.ranking.slice(0, TOP) ?? [];
  const maximo = Math.max(1, ...top.map((g) => g.total));

  return (
    <section className="border-b border-line bg-bg px-5 py-3" aria-label="Métricas de atividade">
      <div className="flex items-center gap-2">
        <button type="button" onClick={alternar} className="mono text-xs uppercase tracking-wider text-fg-faint hover:text-fg">
          {aberto ? "▾" : "▸"} atividade
        </button>
        <div className="ml-auto flex rounded-[6px] border border-line p-0.5">
          {JANELAS.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => trocarJanela(j.id)}
              className={`rounded-[5px] px-2 py-0.5 text-xs font-medium transition-colors ${janela === j.id ? "bg-surface-2 text-fg" : "text-fg-dim hover:text-fg"}`}
            >
              {j.rotulo}
            </button>
          ))}
        </div>
      </div>

      {aberto && dados && (
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_2fr]">
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <Cartao
              titulo="quem mais manda mensagem"
              valor={dados.maisAtivo ? dados.maisAtivo.nome : "ninguém na janela"}
              detalhe={dados.maisAtivo ? `${dados.maisAtivo.total} msgs · ${dados.maisAtivo.cliente} do cliente` : null}
            />
            <Cartao
              titulo="menos ativo"
              valor={dados.menosAtivo ? dados.menosAtivo.nome : "—"}
              detalhe={dados.menosAtivo ? `${dados.menosAtivo.total} msgs na janela` : null}
            />
            <Cartao
              titulo="adormecidos (14d+)"
              valor={dados.adormecidos.length ? `${dados.adormecidos.length} chats` : "nenhum"}
              detalhe={dados.adormecidos.slice(0, 3).map((a) => `${a.nome} ${a.dias}d`).join(" · ") || null}
            />
          </div>

          <ol className="space-y-1" aria-label={`Top ${TOP} por mensagens`}>
            {top.length === 0 && <li className="mono text-xs text-fg-dim">sem mensagens na janela</li>}
            {top.map((g) => (
              <li key={g.slug} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-2 text-xs">
                <span className="truncate text-fg">{g.nome}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${g.total} mensagens`}>
                  <span className="block h-full rounded-full bg-fg-dim" style={{ width: `${Math.round((g.total / maximo) * 100)}%` }} />
                </span>
                <span className="mono text-right text-fg-dim">{g.total}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
