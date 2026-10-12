"use client";

import Link from "next/link";
import { useState } from "react";
import type { Dashboard, LinhaDashboard, Sinal } from "@/lib/dashboard";
import { explicarSinal } from "@/lib/dashboard";
import { dataCurta, instanteCurto, instanteLongo } from "@/lib/formatar-data";

type Coluna =
  | "nome"
  | "contrato"
  | "msgs30d"
  | "features30d"
  | "msgsPorFeature30d"
  | "valorPorFeature"
  | "ultimaFeatureEm";

type Ordem = "asc" | "desc";

const COLUNAS: Array<{ id: Coluna; rotulo: string }> = [
  { id: "nome", rotulo: "Nome" },
  { id: "contrato", rotulo: "Contrato" },
  { id: "msgs30d", rotulo: "Msgs 30d (cliente / total)" },
  { id: "features30d", rotulo: "Entregas 30d / total" },
  { id: "msgsPorFeature30d", rotulo: "Msgs / entrega" },
  { id: "valorPorFeature", rotulo: "Valor / entrega" },
  { id: "ultimaFeatureEm", rotulo: "Última entrega" },
];

const ROTULO_ESTADO: Record<LinhaDashboard["contrato"]["estado"], string> = {
  ativo: "ativo",
  pausado: "pausado",
  encerrado: "encerrado",
  sem: "sem contrato",
};

const TOP = 10;
const numero = new Intl.NumberFormat("pt-BR");
const umaCasa = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Valor comparável por coluna — chave numérica quando faz sentido, string caso contrário. */
function chaveOrdenacao(l: LinhaDashboard, col: Coluna): number | string {
  switch (col) {
    case "nome":
      return l.nome.toLowerCase();
    case "contrato":
      return `${ROTULO_ESTADO[l.contrato.estado]} ${l.contrato.fim ?? ""}`;
    case "msgs30d":
      // A coluna mostra "cliente / total" e é a metade do cliente que o modelo
      // usa nos sinais e no desempate — ordenar por ela mantém tela e regra juntas.
      return l.msgsCliente30d;
    case "features30d":
      return l.features30d;
    case "msgsPorFeature30d":
      return l.msgsPorFeature30d ?? -1;
    case "valorPorFeature":
      return l.valorPorFeature ?? -1;
    case "ultimaFeatureEm":
      return l.ultimaFeatureEm ?? "";
  }
}

function Cartao({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-3 py-2">
      <div className="text-[12px] text-fg-faint font-medium first-letter:uppercase">{titulo}</div>
      <div className="mono text-lg text-fg">{valor}</div>
    </div>
  );
}

/** Uma linha (cliente) e um dos sinais que ela disparou — a lista achatada da seção Sinais. */
interface ItemSinal {
  slug: string;
  nome: string;
  sinal: Sinal;
}

/** Visão de negócio por cliente: contrato × atividade × entregas, ordenável e com sinais para decisão. */
export function DashboardView({ dados }: { dados: Dashboard }) {
  // null = estado inicial, mantém a ordem que já vem do modelo (montarDashboard):
  // mais sinais primeiro, depois mais mensagens de cliente, depois slug.
  const [coluna, setColuna] = useState<Coluna | null>(null);
  const [ordem, setOrdem] = useState<Ordem>("asc");

  function ordenarPor(col: Coluna) {
    if (col === coluna) {
      setOrdem((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setColuna(col);
      setOrdem("asc");
    }
  }

  const linhas =
    coluna === null
      ? dados.linhas
      : [...dados.linhas].sort((a, b) => {
          const ka = chaveOrdenacao(a, coluna);
          const kb = chaveOrdenacao(b, coluna);
          const cmp = typeof ka === "number" && typeof kb === "number" ? ka - kb : String(ka).localeCompare(String(kb));
          return ordem === "asc" ? cmp : -cmp;
        });

  // Achata linha × sinal: uma linha com dois sinais vira dois itens na seção.
  const itensSinal: ItemSinal[] = dados.linhas.flatMap((l) =>
    l.sinais.map((sinal) => ({ slug: l.slug, nome: l.nome, sinal })),
  );

  const topEntregas = [...dados.linhas]
    .filter((l) => l.features30d > 0)
    .sort((a, b) => b.features30d - a.features30d)
    .slice(0, TOP);
  const maxEntregas = Math.max(1, ...topEntregas.map((l) => l.features30d));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-bg">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line bg-surface px-5 py-3">
        <h1 className="font-medium text-fg">Dashboard</h1>
        <span className="mono text-[11px] text-fg-faint">gerado em {instanteLongo(dados.geradoEm)}</span>
      </header>

      <div className="space-y-6 px-5 py-5">
        {/* Totais */}
        <section aria-label="Totais" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Cartao titulo="clientes" valor={numero.format(dados.totais.clientes)} />
          <Cartao titulo="ativos" valor={numero.format(dados.totais.ativos)} />
          <Cartao titulo="encerrados" valor={numero.format(dados.totais.encerrados)} />
          <Cartao titulo="entregas 30d" valor={numero.format(dados.totais.features30d)} />
          <Cartao titulo="com sinal" valor={numero.format(dados.totais.comSinal)} />
        </section>

        {/* Sinais */}
        <section aria-label="Sinais" className="rounded-card border border-line bg-surface p-4">
          <div className="mb-3 text-[12px] text-fg-faint font-medium first-letter:uppercase">sinais</div>
          {itensSinal.length === 0 ? (
            <p className="mono text-xs text-fg-dim">nenhum sinal</p>
          ) : (
            <ul className="space-y-1.5">
              {itensSinal.map((item, i) => (
                <li key={`${item.slug}-${item.sinal}-${i}`} className="text-sm text-fg-dim">
                  <Link href={`/g/${item.slug}`} className="text-fg hover:text-accent">
                    {item.nome}
                  </Link>
                  {" — "}
                  {explicarSinal(item.sinal)}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Top 10 por entregas 30d */}
        <section aria-label="Top 10 por entregas em 30 dias" className="rounded-card border border-line bg-surface p-4">
          <div className="mb-3 text-[12px] text-fg-faint font-medium first-letter:uppercase">top 10 · entregas em 30 dias</div>
          {topEntregas.length === 0 ? (
            <p className="mono text-xs text-fg-dim">sem entregas registradas</p>
          ) : (
            <ol className="space-y-1" aria-label="Top 10 por entregas em 30 dias">
              {topEntregas.map((l) => (
                <li key={l.slug} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-2 text-xs">
                  <span className="truncate text-fg">{l.nome}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${l.features30d} entregas`}>
                    <span className="block h-full rounded-full bg-fg-dim" style={{ width: `${Math.round((l.features30d / maxEntregas) * 100)}%` }} />
                  </span>
                  <span className="mono text-right text-fg-dim">{numero.format(l.features30d)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Tabela */}
        <section aria-label="Tabela de clientes" className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {COLUNAS.map((c) => {
                    const ativa = c.id === coluna;
                    return (
                      <th
                        key={c.id}
                        scope="col"
                        className="px-3 py-2"
                        aria-sort={ativa ? (ordem === "asc" ? "ascending" : "descending") : "none"}
                      >
                        <button
                          type="button"
                          onClick={() => ordenarPor(c.id)}
                          className={`mono flex items-center gap-1 text-[11px] first-letter:uppercase transition-colors ${ativa ? "text-fg" : "text-fg-faint hover:text-fg-dim"}`}
                        >
                          {c.rotulo}
                          {ativa && <span aria-hidden>{ordem === "asc" ? "▲" : "▼"}</span>}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {linhas.length === 0 ? (
                  <tr>
                    <td colSpan={COLUNAS.length} className="mono px-3 py-6 text-center text-xs text-fg-dim">
                      nenhum cliente monitorado
                    </td>
                  </tr>
                ) : (
                  linhas.map((l) => (
                    <tr key={l.slug}>
                      <td className="px-3 py-2 text-fg">
                        <Link href={`/g/${l.slug}`} className="hover:text-accent">
                          {l.nome}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-fg-dim">
                        {ROTULO_ESTADO[l.contrato.estado]}
                        {l.contrato.fim && <span className="mono text-[11px] text-fg-faint"> · até {dataCurta(l.contrato.fim)}</span>}
                      </td>
                      <td className="mono px-3 py-2 text-right text-fg-dim">
                        {numero.format(l.msgsCliente30d)}/{numero.format(l.msgs30d)}
                      </td>
                      <td className="mono px-3 py-2 text-right text-fg-dim">
                        {numero.format(l.features30d)}/{numero.format(l.featuresTotal)}
                      </td>
                      <td className="mono px-3 py-2 text-right text-fg-dim">
                        {l.msgsPorFeature30d !== null ? umaCasa.format(l.msgsPorFeature30d) : "—"}
                      </td>
                      <td className="mono px-3 py-2 text-right text-fg-dim">
                        {l.valorPorFeature !== null ? moeda.format(l.valorPorFeature) : "—"}
                      </td>
                      <td className="mono px-3 py-2 text-right text-fg-dim">{instanteCurto(l.ultimaFeatureEm)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
