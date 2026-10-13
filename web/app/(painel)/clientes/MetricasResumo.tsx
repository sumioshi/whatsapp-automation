"use client";

import Link from "next/link";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { Segmentado } from "@/app/components/ui";
import { corDoMatiz, matizDoNome } from "@/lib/aparencia";
import type { Metricas } from "@/lib/metricas";

type Janela = Metricas["janela"];
const JANELAS: Array<{ valor: Janela; rotulo: string }> = [
  { valor: "24h", rotulo: "24 h" },
  { valor: "7d", rotulo: "7 dias" },
  { valor: "30d", rotulo: "30 dias" },
];
const CHAVE_JANELA = "wac-metricas-janela";
const TOP = 5;

function Celula({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-l border-line px-4 py-3 first:border-l-0 max-[1020px]:border-l-0 max-[1020px]:border-t max-[1020px]:first:border-t-0">
      <p className="text-[12px] text-fg-faint">{titulo}</p>
      {children}
    </div>
  );
}

/**
 * Resumo recolhível de quem mais fala e quem parou de falar, na janela escolhida
 * (dados de /api/metricas). Fica numa faixa só: o detalhe por cliente está nas colunas.
 */
export function MetricasResumo() {
  const [janela, setJanela] = useState<Janela>("7d");
  const [dados, setDados] = useState<Metricas | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    try {
      const j = window.localStorage.getItem(CHAVE_JANELA);
      if (j === "24h" || j === "7d" || j === "30d") setJanela(j);
    } catch {
      /* sem storage */
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/metricas?janela=${janela}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((m: Metricas) => {
        if (!vivo) return;
        setDados(m);
        setFalhou(false);
      })
      .catch(() => {
        if (vivo) setFalhou(true);
      });
    return () => {
      vivo = false;
    };
  }, [janela]);

  function trocarJanela(j: Janela) {
    setJanela(j);
    try {
      window.localStorage.setItem(CHAVE_JANELA, j);
    } catch {
      /* sem storage */
    }
  }

  const top = dados?.ranking.slice(0, TOP) ?? [];
  const maximo = Math.max(1, ...top.map((g) => g.total));

  return (
    <section aria-label="Resumo de atividade" className="shrink-0 border-b border-line bg-bg px-8 py-3 max-[860px]:px-4">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h2 className="text-[13px] font-semibold text-fg">Atividade</h2>
        <Segmentado rotulo="Janela da atividade" opcoes={JANELAS} valor={janela} aoMudar={trocarJanela} />
        <Link href="/dashboard" className="ml-auto text-[12.5px] font-medium text-accent hover:underline">
          Abrir painel
        </Link>
      </div>

      {falhou && !dados && <p className="text-[13px] text-fg-faint">Não deu para carregar a atividade agora.</p>}
      {dados && (
        <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.4fr)] rounded-card border border-line bg-surface [box-shadow:var(--shadow-card)] max-[1020px]:grid-cols-1">
          <Celula titulo="Quem mais manda mensagem">
            <p className="mt-1 truncate text-[13.5px] font-medium text-fg" title={dados.maisAtivo?.nome}>
              {dados.maisAtivo ? dados.maisAtivo.nome : "Ninguém nessa janela"}
            </p>
            {dados.maisAtivo && (
              <p className="truncate text-[12px] text-fg-dim">
                <span className="font-mono tabular-nums">{dados.maisAtivo.total}</span> mensagens,{" "}
                <span className="font-mono tabular-nums">{dados.maisAtivo.cliente}</span> do cliente
              </p>
            )}
          </Celula>
          <Celula titulo="Menos ativo">
            <p className="mt-1 truncate text-[13.5px] font-medium text-fg" title={dados.menosAtivo?.nome}>
              {dados.menosAtivo ? dados.menosAtivo.nome : "—"}
            </p>
            {dados.menosAtivo && (
              <p className="truncate text-[12px] text-fg-dim">
                <span className="font-mono tabular-nums">{dados.menosAtivo.total}</span> mensagens na janela
              </p>
            )}
          </Celula>
          <Celula titulo="Parados há 14 dias ou mais">
            <p className="mt-1 text-[13.5px] font-medium text-fg">
              {dados.adormecidos.length ? (
                <>
                  <span className="font-mono tabular-nums">{dados.adormecidos.length}</span> conversas
                </>
              ) : (
                "Nenhuma"
              )}
            </p>
            {dados.adormecidos.length > 0 && (
              <p
                className="truncate text-[12px] text-fg-dim"
                title={dados.adormecidos.map((a) => `${a.nome} ${a.dias}d`).join(" · ")}
              >
                {dados.adormecidos
                  .slice(0, 3)
                  .map((a) => `${a.nome} ${a.dias}d`)
                  .join(" · ")}
              </p>
            )}
          </Celula>
          <Celula titulo={`Os ${TOP} que mais mandaram mensagem`}>
            {top.length === 0 ? (
              <p className="mt-1 text-[13px] text-fg-faint">Sem mensagens nessa janela.</p>
            ) : (
              <ol className="mt-1.5 space-y-0.5">
                {top.map((g) => (
                  <li
                    key={g.slug}
                    style={{ "--hue": corDoMatiz(matizDoNome(g.nome)) } as CSSProperties}
                    className="relative isolate flex h-[18px] items-center gap-2 px-1.5 text-[12px]"
                    title={`${g.nome}: ${g.total} mensagens`}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 -z-10 rounded-[4px] bg-[color-mix(in_srgb,var(--hue)_var(--tint),var(--color-surface))]"
                      style={{ width: `${Math.max(6, (g.total / maximo) * 100)}%` }}
                    />
                    <span className="min-w-0 flex-1 truncate text-fg">{g.nome}</span>
                    <span className="font-mono tabular-nums text-fg">{g.total}</span>
                  </li>
                ))}
              </ol>
            )}
          </Celula>
        </div>
      )}
    </section>
  );
}
