"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, Badge, Card, cn, Pares } from "@/app/components/ui";
import { tipoPeloSlug } from "@/lib/aparencia";
import type { Dashboard, LinhaDashboard } from "@/lib/dashboard";
import { dataCurta, instanteCurto, instanteLongo } from "@/lib/formatar-data";
import type { SinalDoDia, TomSinal } from "@/lib/hoje";
import { rotasPainel } from "@/lib/rotas-painel";
import { Icone } from "../_hoje/icones";
import { FOCO } from "../_hoje/pecas";

type Coluna =
  | "nome"
  | "contrato"
  | "msgs30d"
  | "features30d"
  | "msgsPorFeature30d"
  | "valorPorFeature"
  | "ultimaFeatureEm";

type Ordem = "asc" | "desc";

const COLUNAS: Array<{ id: Coluna; rotulo: string; direita?: boolean }> = [
  { id: "nome", rotulo: "Cliente" },
  { id: "contrato", rotulo: "Contrato" },
  { id: "msgs30d", rotulo: "Msgs 30 d (cliente / total)", direita: true },
  { id: "features30d", rotulo: "Entregas 30 d / total", direita: true },
  { id: "msgsPorFeature30d", rotulo: "Msgs por entrega", direita: true },
  { id: "valorPorFeature", rotulo: "Valor por entrega", direita: true },
  { id: "ultimaFeatureEm", rotulo: "Última entrega", direita: true },
];

const ROTULO_ESTADO: Record<LinhaDashboard["contrato"]["estado"], string> = {
  ativo: "ativo",
  pausado: "pausado",
  encerrado: "encerrado",
  sem: "sem contrato",
};

const COR_ESTADO: Record<LinhaDashboard["contrato"]["estado"], string> = {
  ativo: "bg-ok",
  pausado: "bg-warn-mark",
  encerrado: "bg-fg-mute",
  sem: "bg-fg-mute",
};

const VARIANTE_TOM: Record<TomSinal, "danger" | "warn" | "neutral"> = { perigo: "danger", atencao: "warn", neutro: "neutral" };

const rotas = rotasPainel("dono");
/** Sinais visíveis antes de "Ver todos": o resto fica a um clique. */
const SINAIS_INICIAIS = 8;
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

/**
 * Contratos e entregas por cliente (últimos 30 dias): os sinais com o que fazer,
 * os totais e a tabela ordenável. É o que a tela de dashboard sempre mostrou.
 */
export function DashboardView({
  dados,
  sinais,
  fotos,
}: {
  dados: Dashboard;
  sinais: SinalDoDia[];
  fotos: Record<string, string | null>;
}) {
  // null = estado inicial, mantém a ordem que já vem do modelo (montarDashboard):
  // mais sinais primeiro, depois mais mensagens de cliente, depois slug.
  const [coluna, setColuna] = useState<Coluna | null>(null);
  const [ordem, setOrdem] = useState<Ordem>("asc");
  const [todosSinais, setTodosSinais] = useState(false);

  // Quem chega pelo "Ver no painel" do Hoje quer a lista inteira.
  useEffect(() => {
    if (window.location.hash === "#sinais") setTodosSinais(true);
  }, []);

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

  const foto = (slug: string) => {
    const p = fotos[slug];
    return p ? rotas.midia(p) : null;
  };

  return (
    <>
      <div id="sinais" className="col-span-8 scroll-mt-6 max-[1020px]:col-span-full">
        <Card
          className="h-full"
          icone={<Icone nome="bandeira" />}
          titulo="Sinais"
          meta={<span className="font-mono tabular-nums">{sinais.length}</span>}
          rodape={
            <>
              <span>contrato, prazo e silêncio, o mais grave primeiro</span>
              {sinais.length > SINAIS_INICIAIS && (
                <button
                  type="button"
                  aria-expanded={todosSinais}
                  onClick={() => setTodosSinais((t) => !t)}
                  className={cn("ml-auto shrink-0 rounded-[4px] font-medium text-accent hover:underline", FOCO)}
                >
                  {todosSinais ? "Mostrar menos" : `Ver todos os ${sinais.length}`}
                </button>
              )}
            </>
          }
        >
          {sinais.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-fg-faint">
              Nenhum sinal: contratos em dia e ninguém sem resposta há mais de 24 h.
            </p>
          ) : (
            <ul>
              {(todosSinais ? sinais : sinais.slice(0, SINAIS_INICIAIS)).map((s) => (
                <li key={s.chave}>
                  <Link
                    href={rotas.chat(s.slug)}
                    className={cn("group flex min-h-[52px] items-center gap-3 border-b border-line py-2 text-fg last:border-b-0", FOCO)}
                  >
                    <Avatar nome={s.nome} tipo={tipoPeloSlug(s.slug)} fotoUrl={foto(s.slug)} tamanho="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <b className="min-w-0 truncate font-medium group-hover:text-accent">{s.nome}</b>
                        <Badge variant={VARIANTE_TOM[s.tom]} className="ml-auto shrink-0">
                          {s.texto}
                        </Badge>
                      </span>
                      <small className="mt-0.5 block text-[12.5px] text-fg-faint">{s.explicacao}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card largura="p" icone={<Icone nome="tabela" />} titulo="Totais" meta="últimos 30 dias" className="self-start">
        <Pares
          className="[&_dd]:font-mono [&_dd]:tabular-nums"
          itens={[
            { rotulo: "Clientes", valor: numero.format(dados.totais.clientes) },
            { rotulo: "Contratos ativos", valor: numero.format(dados.totais.ativos) },
            { rotulo: "Encerrados", valor: numero.format(dados.totais.encerrados) },
            { rotulo: "Entregas", valor: numero.format(dados.totais.features30d) },
            { rotulo: "Com sinal", valor: numero.format(dados.totais.comSinal) },
          ]}
        />
      </Card>

      <Card
        largura="inteiro"
        icone={<Icone nome="pacote" />}
        titulo="Contratos e entregas por cliente"
        meta="últimos 30 dias"
        className="[&>div]:px-0 [&>div]:pb-0"
        rodape={<span className="font-mono tabular-nums">gerado em {instanteLongo(dados.geradoEm)}</span>}
      >
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                {COLUNAS.map((c) => {
                  const ativa = c.id === coluna;
                  return (
                    <th
                      key={c.id}
                      scope="col"
                      aria-sort={ativa ? (ordem === "asc" ? "ascending" : "descending") : "none"}
                      className={cn(
                        "h-[38px] whitespace-nowrap border-b border-line bg-surface-2 px-3.5 first:pl-5 last:pr-5",
                        c.direita ? "text-right" : "text-left",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => ordenarPor(c.id)}
                        className={cn(
                          "inline-flex items-center gap-1 text-[12px] font-medium transition-colors",
                          ativa ? "text-fg" : "text-fg-dim hover:text-fg",
                        )}
                      >
                        {c.rotulo}
                        {ativa && <span aria-hidden>{ordem === "asc" ? "▲" : "▼"}</span>}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 ? (
                <tr>
                  <td colSpan={COLUNAS.length} className="px-5 py-8 text-center text-[12.5px] text-fg-faint">
                    Nenhum cliente com contrato ou entrega ainda. Os grupos monitorados aparecem aqui.
                  </td>
                </tr>
              ) : (
                linhas.map((l) => (
                  <tr key={l.slug} className="group/linha hover:[&>td]:bg-surface-2">
                    <td className="h-12 border-b border-line px-3.5 pl-5 group-last/linha:border-b-0">
                      <Link href={rotas.chat(l.slug)} className={cn("flex items-center gap-2.5 rounded-[4px] font-medium text-fg hover:text-accent", FOCO)}>
                        <Avatar nome={l.nome} tipo={tipoPeloSlug(l.slug)} fotoUrl={foto(l.slug)} tamanho="sm" />
                        <span className="max-w-[260px] truncate">{l.nome}</span>
                      </Link>
                    </td>
                    <td className="h-12 whitespace-nowrap border-b border-line px-3.5 text-fg-dim group-last/linha:border-b-0">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className={cn("h-2 w-2 rounded-full", COR_ESTADO[l.contrato.estado])} />
                        {ROTULO_ESTADO[l.contrato.estado]}
                      </span>
                      {l.contrato.fim && <span className="font-mono text-[12px] text-fg-faint"> · até {dataCurta(l.contrato.fim)}</span>}
                    </td>
                    <Numero>
                      {numero.format(l.msgsCliente30d)} / {numero.format(l.msgs30d)}
                    </Numero>
                    <Numero>
                      {numero.format(l.features30d)} / {numero.format(l.featuresTotal)}
                    </Numero>
                    <Numero>{l.msgsPorFeature30d !== null ? umaCasa.format(l.msgsPorFeature30d) : "—"}</Numero>
                    <Numero>{l.valorPorFeature !== null ? moeda.format(l.valorPorFeature) : "—"}</Numero>
                    <Numero ultima>{instanteCurto(l.ultimaFeatureEm)}</Numero>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Numero({ children, ultima }: { children: React.ReactNode; ultima?: boolean }) {
  return (
    <td
      className={cn(
        "h-12 whitespace-nowrap border-b border-line px-3.5 text-right font-mono tabular-nums text-fg-dim group-last/linha:border-b-0",
        ultima && "pr-5",
      )}
    >
      {children}
    </td>
  );
}
