"use client";

import { Etiqueta, Segmentado, cn } from "@/app/components/ui";
import { COLUNAS, type ColunaId, type EscolhaColunas, colunaVisivel } from "@/lib/clientes-colunas";
import type { ChaveOrdem, FiltroContrato, FiltrosClientes, Ordem, Segmento } from "@/lib/clientes-tabela";
import { IcAtividade, IcBusca, IcColunas, IcFechar, IcMais, IcOrdem, IcSetaBaixo } from "./icones";
import { DivisorMenu, ItemMenu, MenuSuspenso, SecaoMenu } from "./MenuSuspenso";
import { RadarBadge } from "./RadarBadge";
import { SyncWidget } from "./SyncWidget";

export type FiltrosExtras = Pick<FiltrosClientes, "segmento" | "etiqueta" | "contrato">;

const CONTRATOS: Array<{ valor: FiltroContrato; rotulo: string }> = [
  { valor: "ativo", rotulo: "ativo" },
  { valor: "renova", rotulo: "renova em até 30 dias" },
  { valor: "pausado", rotulo: "pausado" },
  { valor: "encerrado", rotulo: "encerrado" },
  { valor: "sem", rotulo: "sem contrato" },
];

const ORDENS: Array<{ chave: ChaveOrdem; rotulo: string; dica?: string }> = [
  { chave: "espera", rotulo: "Maior espera", dica: "Quem espera resposta há mais tempo primeiro" },
  { chave: "uso", rotulo: "Uso do contrato" },
  { chave: "atividade", rotulo: "Atividade" },
  { chave: "entregas", rotulo: "Entregas" },
  { chave: "ultima", rotulo: "Última mensagem" },
  { chave: "contrato", rotulo: "Valor do contrato" },
  { chave: "nome", rotulo: "Nome" },
];

const BOTAO =
  "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent max-[860px]:h-10";
const BOTAO_BORDA = `${BOTAO} border border-line-2 bg-surface text-fg hover:border-fg-mute hover:bg-elevated`;
const BOTAO_FANTASMA = `${BOTAO} text-fg-dim hover:bg-elevated hover:text-fg`;

/**
 * Barra de filtros da tela de clientes: visão (clientes ou todas as conversas), recorte
 * com contagem, etiquetas, contrato, busca e, à direita, radar, sincronização, atividade,
 * ordem e colunas.
 */
export function BarraClientes({
  contexto,
  aoMudarContexto,
  filtros,
  aoMudarFiltros,
  contagem,
  busca,
  aoBuscar,
  etiquetas,
  ordem,
  aoOrdenar,
  escolha,
  aoAlternarColuna,
  aoRestaurarColunas,
  mostrarColunas,
  metricasAbertas,
  aoAlternarMetricas,
}: {
  contexto: "trabalho" | "tudo";
  aoMudarContexto: (c: "trabalho" | "tudo") => void;
  filtros: FiltrosExtras;
  aoMudarFiltros: (f: FiltrosExtras) => void;
  contagem: Record<Segmento, number>;
  busca: string;
  aoBuscar: (q: string) => void;
  etiquetas: string[];
  ordem: Ordem;
  aoOrdenar: (o: Ordem) => void;
  escolha: EscolhaColunas;
  aoAlternarColuna: (id: ColunaId) => void;
  aoRestaurarColunas: () => void;
  mostrarColunas: boolean;
  metricasAbertas: boolean;
  aoAlternarMetricas: () => void;
}) {
  const mudar = (p: Partial<FiltrosExtras>) => aoMudarFiltros({ ...filtros, ...p });
  const contrato = filtros.contrato ? CONTRATOS.find((c) => c.valor === filtros.contrato)?.rotulo ?? filtros.contrato : null;
  const rotuloOrdem = ORDENS.find((o) => o.chave === ordem.chave)?.rotulo ?? "Ordem";
  const telaLarga = typeof window !== "undefined" && window.matchMedia("(min-width: 1600px)").matches;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-8 py-3 max-[860px]:gap-1 max-[860px]:px-4">
      <MenuSuspenso
        rotulo="Quais conversas mostrar"
        classeGatilho={BOTAO_BORDA}
        largura="w-72"
        conteudoGatilho={
          <>
            <span className="max-[860px]:hidden">{contexto === "trabalho" ? "Todos os clientes" : "Todas as conversas"}</span>
            <span className="hidden max-[860px]:inline">{contexto === "trabalho" ? "Clientes" : "Todas"}</span>
            <IcSetaBaixo className="h-3.5 w-3.5 text-fg-faint" />
          </>
        }
      >
        {(fechar) => (
          <>
            <ItemMenu
              tipo="radio"
              marcado={contexto === "trabalho"}
              dica="Grupos e conversas com empresa, contrato ou entrega"
              aoEscolher={() => {
                aoMudarContexto("trabalho");
                fechar();
              }}
            >
              Todos os clientes
            </ItemMenu>
            <ItemMenu
              tipo="radio"
              marcado={contexto === "tudo"}
              dica="Inclui as pessoais e as conversas soltas"
              aoEscolher={() => {
                aoMudarContexto("tudo");
                fechar();
              }}
            >
              Todas as conversas
            </ItemMenu>
          </>
        )}
      </MenuSuspenso>

      <Segmentado<Segmento>
        rotulo="Recorte"
        className="max-[860px]:order-2 max-[860px]:my-1"
        opcoes={[
          { valor: "todos", rotulo: "Todos", num: contagem.todos },
          { valor: "esperando", rotulo: "Esperando", num: contagem.esperando },
          { valor: "grupos", rotulo: "Grupos", num: contagem.grupos },
          { valor: "dms", rotulo: "DMs", num: contagem.dms },
        ]}
        valor={filtros.segmento}
        aoMudar={(segmento) => mudar({ segmento })}
      />

      {etiquetas.length > 0 && (
        <div role="group" aria-label="Filtrar por etiqueta" className="flex flex-wrap items-center gap-1 max-[860px]:hidden">
          {etiquetas.map((e) => {
            const ativa = filtros.etiqueta === e;
            return (
              <button
                key={e}
                type="button"
                aria-pressed={ativa}
                title={ativa ? `Tirar o filtro ${e}` : `Só quem tem a etiqueta ${e}`}
                onClick={() => mudar({ etiqueta: ativa ? null : e })}
                className={cn(
                  "rounded-full transition-opacity focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                  ativa && "ring-[1.5px] ring-fg",
                  filtros.etiqueta && !ativa && "opacity-45 hover:opacity-80",
                )}
              >
                <Etiqueta nome={e} tamanho="sm" />
              </button>
            );
          })}
        </div>
      )}

      {filtros.etiqueta && (
        <span className="hidden h-10 items-center gap-1 rounded-control border border-line-2 bg-surface-2 pl-2.5 pr-1 text-[12.5px] text-fg max-[860px]:order-2 max-[860px]:inline-flex">
          Etiqueta: {filtros.etiqueta}
          <button
            type="button"
            onClick={() => mudar({ etiqueta: null })}
            aria-label={`Tirar o filtro etiqueta ${filtros.etiqueta}`}
            className="grid h-8 w-8 place-items-center rounded-[4px] text-fg-faint hover:bg-elevated hover:text-fg"
          >
            <IcFechar className="h-3 w-3" />
          </button>
        </span>
      )}

      {contrato && (
        <span className="inline-flex h-7 items-center gap-1 rounded-control border border-line-2 bg-surface-2 pl-2.5 pr-1 text-[12.5px] text-fg max-[860px]:order-2 max-[860px]:h-10">
          Contrato: {contrato}
          <button
            type="button"
            onClick={() => mudar({ contrato: null })}
            aria-label={`Tirar o filtro contrato ${contrato}`}
            className="grid h-5 w-5 place-items-center rounded-[4px] text-fg-faint hover:bg-elevated hover:text-fg max-[860px]:h-8 max-[860px]:w-8"
          >
            <IcFechar className="h-3 w-3" />
          </button>
        </span>
      )}

      <MenuSuspenso
        rotulo="Acrescentar filtro"
        className="max-[860px]:order-1"
        classeGatilho={`${BOTAO} border border-dashed border-line-2 text-fg-dim hover:border-fg-mute hover:text-fg`}
        conteudoGatilho={
          <>
            <IcMais className="h-3.5 w-3.5" />
            Filtro
          </>
        }
      >
        {(fechar) => (
          <>
            <SecaoMenu>Contrato</SecaoMenu>
            {CONTRATOS.map((c) => (
              <ItemMenu
                key={c.valor}
                tipo="radio"
                marcado={filtros.contrato === c.valor}
                aoEscolher={() => {
                  mudar({ contrato: filtros.contrato === c.valor ? null : c.valor });
                  fechar();
                }}
              >
                {c.rotulo.charAt(0).toUpperCase() + c.rotulo.slice(1)}
              </ItemMenu>
            ))}
            {etiquetas.length > 0 && (
              <>
                <DivisorMenu />
                <SecaoMenu>Etiqueta</SecaoMenu>
                {etiquetas.map((e) => (
                  <ItemMenu
                    key={e}
                    tipo="radio"
                    marcado={filtros.etiqueta === e}
                    aoEscolher={() => {
                      mudar({ etiqueta: filtros.etiqueta === e ? null : e });
                      fechar();
                    }}
                  >
                    {e}
                  </ItemMenu>
                ))}
              </>
            )}
          </>
        )}
      </MenuSuspenso>

      <label className="relative flex items-center max-[860px]:order-3 max-[860px]:w-full">
        <IcBusca className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-fg-faint" />
        <span className="sr-only">Buscar cliente pelo nome</span>
        <input
          type="search"
          value={busca}
          onChange={(e) => aoBuscar(e.target.value)}
          placeholder="Buscar cliente…"
          className="h-7 w-44 rounded-control border border-line bg-surface pl-8 pr-2.5 text-[12.5px] text-fg placeholder:text-fg-faint focus:border-line-2 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent max-[860px]:h-10 max-[860px]:w-full max-[860px]:text-[16px]"
        />
      </label>

      <span className="flex flex-1 items-center justify-end gap-1 max-[860px]:order-1 max-[860px]:flex-none max-[860px]:gap-0">
        <RadarBadge onClick={() => mudar({ segmento: "esperando" })} />
        <SyncWidget />
        <button
          type="button"
          aria-pressed={metricasAbertas}
          title={metricasAbertas ? "Esconder o resumo de atividade" : "Mostrar o resumo de atividade (quem mais e quem menos conversa)"}
          onClick={aoAlternarMetricas}
          className={cn(BOTAO_FANTASMA, "px-2 max-[860px]:w-10 max-[860px]:justify-center", metricasAbertas && "bg-elevated text-fg")}
        >
          <IcAtividade className="h-4 w-4" />
          <span className="sr-only">Resumo de atividade</span>
        </button>

        <MenuSuspenso
          rotulo="Ordenar clientes"
          dica={`Ordem: ${rotuloOrdem}`}
          alinhar="direita"
          classeGatilho={BOTAO_FANTASMA}
          conteudoGatilho={
            <>
              <IcOrdem className="h-4 w-4" />
              <span className="max-[860px]:sr-only">{rotuloOrdem}</span>
            </>
          }
        >
          {(fechar) => (
            <>
              {ORDENS.map((o) => (
                <ItemMenu
                  key={o.chave}
                  tipo="radio"
                  marcado={ordem.chave === o.chave}
                  dica={o.dica}
                  aoEscolher={() => {
                    aoOrdenar({ chave: o.chave, desc: o.chave !== "nome" });
                    fechar();
                  }}
                >
                  {o.rotulo}
                </ItemMenu>
              ))}
              {ordem.chave !== "espera" && (
                <>
                  <DivisorMenu />
                  <SecaoMenu>Sentido</SecaoMenu>
                  <ItemMenu
                    tipo="radio"
                    marcado={ordem.desc}
                    aoEscolher={() => {
                      aoOrdenar({ ...ordem, desc: true });
                      fechar();
                    }}
                  >
                    {ordem.chave === "nome" ? "De Z a A" : "Maior primeiro"}
                  </ItemMenu>
                  <ItemMenu
                    tipo="radio"
                    marcado={!ordem.desc}
                    aoEscolher={() => {
                      aoOrdenar({ ...ordem, desc: false });
                      fechar();
                    }}
                  >
                    {ordem.chave === "nome" ? "De A a Z" : "Menor primeiro"}
                  </ItemMenu>
                </>
              )}
            </>
          )}
        </MenuSuspenso>

        {mostrarColunas && (
          <MenuSuspenso
            rotulo="Colunas da tabela"
            dica="Escolher as colunas da tabela"
            alinhar="direita"
            classeGatilho={BOTAO_FANTASMA}
            conteudoGatilho={
              <>
                <IcColunas className="h-4 w-4" />
                <span className="max-[1599px]:sr-only">Colunas</span>
              </>
            }
          >
            {() => (
              <>
                {COLUNAS.map((c) => (
                  <ItemMenu key={c.id} tipo="caixa" marcado={colunaVisivel(c, escolha, telaLarga)} aoEscolher={() => aoAlternarColuna(c.id)}>
                    {c.rotulo}
                  </ItemMenu>
                ))}
                {escolha && (
                  <>
                    <DivisorMenu />
                    <ItemMenu aoEscolher={aoRestaurarColunas}>Voltar ao padrão</ItemMenu>
                  </>
                )}
              </>
            )}
          </MenuSuspenso>
        )}
      </span>
    </div>
  );
}
