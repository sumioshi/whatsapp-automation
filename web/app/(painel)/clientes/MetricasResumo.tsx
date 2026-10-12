"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useState } from "react";
import { Avatar, Segmentado } from "@/app/components/ui";
import { corDoMatiz, matizDoNome, tipoPeloSlug } from "@/lib/aparencia";
import type { Metricas } from "@/lib/metricas";

type Janela = Metricas["janela"];
const JANELAS: Array<{ valor: Janela; rotulo: string }> = [
  { valor: "24h", rotulo: "24 h" },
  { valor: "7d", rotulo: "7 dias" },
  { valor: "30d", rotulo: "30 dias" },
];
const CHAVE_JANELA = "wac-metricas-janela";
const TOP = 10;

function Resumo({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe: string | null }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-surface px-4 py-3 [box-shadow:var(--shadow-card)]">
      <p className="text-[12.5px] text-fg-faint">{titulo}</p>
      <p className="mt-1 truncate text-[14px] font-medium text-fg">{valor}</p>
      {detalhe && <p className="mt-0.5 truncate text-[12px] text-fg-dim">{detalhe}</p>}
    </div>
  );
}

/**
 * Quem mais fala, quem parou de falar. Dados de /api/metricas, na janela escolhida.
 * As barras do ranking têm a cor do cliente, como no Painel.
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
    <section aria-label="Atividade dos chats" className="shrink-0 border-b border-line bg-bg px-8 py-4 max-[860px]:px-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-[14.5px] font-semibold tracking-[-0.006em] text-fg">Quem mais conversa</h2>
        <Segmentado rotulo="Janela da atividade" opcoes={JANELAS} valor={janela} aoMudar={trocarJanela} />
        <Link href="/dashboard" className="ml-auto text-[12.5px] font-medium text-accent hover:underline">
          Abrir painel
        </Link>
      </div>

      {falhou && !dados && <p className="text-[13px] text-fg-faint">Não deu para carregar a atividade agora.</p>}
      {dados && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className="grid content-start gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Resumo
              titulo="Quem mais manda mensagem"
              valor={dados.maisAtivo ? dados.maisAtivo.nome : "Ninguém nessa janela"}
              detalhe={dados.maisAtivo ? `${dados.maisAtivo.total} mensagens, ${dados.maisAtivo.cliente} do cliente` : null}
            />
            <Resumo
              titulo="Menos ativo"
              valor={dados.menosAtivo ? dados.menosAtivo.nome : "—"}
              detalhe={dados.menosAtivo ? `${dados.menosAtivo.total} mensagens na janela` : null}
            />
            <Resumo
              titulo="Parados há 14 dias ou mais"
              valor={dados.adormecidos.length ? `${dados.adormecidos.length} conversas` : "Nenhuma"}
              detalhe={dados.adormecidos.slice(0, 3).map((a) => `${a.nome} ${a.dias}d`).join(" · ") || null}
            />
          </div>

          <ol
            aria-label={`Os ${TOP} que mais mandaram mensagem`}
            className="rounded-card border border-line bg-surface p-2 [box-shadow:var(--shadow-card)]"
          >
            {top.length === 0 && <li className="px-2 py-3 text-[13px] text-fg-faint">Sem mensagens nessa janela.</li>}
            {top.map((g) => (
              <li
                key={g.slug}
                style={{ "--hue": corDoMatiz(matizDoNome(g.nome)) } as CSSProperties}
                className="relative isolate flex h-8 items-center gap-2.5 px-2 text-[13px]"
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0.5 left-0 -z-10 rounded-[6px] bg-[color-mix(in_srgb,var(--hue)_var(--tint),var(--color-surface))]"
                  style={{ width: `calc((100% - 52px) * ${(g.total / maximo).toFixed(3)} + 36px)` }}
                />
                <Avatar nome={g.nome} tipo={tipoPeloSlug(g.slug)} tamanho="xs" />
                <span className="min-w-0 flex-1 truncate font-medium text-fg">{g.nome}</span>
                <span className="font-mono text-[12.5px] font-medium tabular-nums text-fg">{g.total}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
