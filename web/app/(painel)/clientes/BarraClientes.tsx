"use client";

import type { ReactNode } from "react";
import { cn } from "@/app/components/ui";
import { COLUNAS, type ColunaId, type EscolhaColunas, colunaVisivel } from "@/lib/clientes-colunas";
import type { ChaveOrdem, FiltroContrato, FiltrosClientes, Ordem } from "@/lib/clientes-tabela";
import { IcAtividade, IcBusca, IcColunas, IcFechar, IcMais, IcOrdem, IcSetaBaixo } from "./icones";
import { DivisorMenu, ItemMenu, MenuSuspenso, SecaoMenu } from "./MenuSuspenso";
import { RadarBadge } from "./RadarBadge";

export type FiltrosExtras = Pick<FiltrosClientes, "esperando" | "tipo" | "etiqueta" | "contrato">;

const CONTRATOS: Array<{ valor: FiltroContrato; rotulo: string }> = [
  { valor: "ativo", rotulo: "ativo" },
  { valor: "renova", rotulo: "renova em até 30 dias" },
  { valor: "pausado", rotulo: "pausado" },
  { valor: "encerrado", rotulo: "encerrado" },
  { valor: "sem", rotulo: "sem contrato" },
];

const ORDENS: Array<{ chave: ChaveOrdem; rotulo: string }> = [
  { chave: "espera", rotulo: "Esperando há mais tempo" },
  { chave: "uso", rotulo: "Uso do contrato" },
  { chave: "atividade", rotulo: "Atividade em 30 dias" },
  { chave: "entregas", rotulo: "Entregas em 30 dias" },
  { chave: "ultima", rotulo: "Última mensagem" },
  { chave: "contrato", rotulo: "Valor do contrato" },
  { chave: "nome", rotulo: "Nome" },
];

const BOTAO =
  "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent max-[860px]:h-10";
const BOTAO_BORDA = `${BOTAO} border border-line-2 bg-surface text-fg hover:border-fg-mute hover:bg-elevated`;
const BOTAO_FANTASMA = `${BOTAO} text-fg-dim hover:bg-elevated hover:text-fg`;

/** Barra de filtros da tela de clientes: visão, filtros removíveis, busca, ordem e colunas. */
export function BarraClientes({
  contexto,
  aoMudarContexto,
  filtros,
  aoMudarFiltros,
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
  const ativos: Array<{ chave: string; rotulo: ReactNode; tirar: () => void }> = [];
  if (filtros.esperando) ativos.push({ chave: "esperando", rotulo: "Esperando resposta", tirar: () => mudar({ esperando: false }) });
  if (filtros.tipo) {
    ativos.push({ chave: "tipo", rotulo: `Tipo: ${filtros.tipo === "dm" ? "conversa direta" : "grupo"}`, tirar: () => mudar({ tipo: null }) });
  }
  if (filtros.contrato) {
    const r = CONTRATOS.find((c) => c.valor === filtros.contrato)?.rotulo ?? filtros.contrato;
    ativos.push({ chave: "contrato", rotulo: `Contrato: ${r}`, tirar: () => mudar({ contrato: null }) });
  }
  if (filtros.etiqueta) ativos.push({ chave: "etiqueta", rotulo: `Etiqueta: ${filtros.etiqueta}`, tirar: () => mudar({ etiqueta: null }) });
  const rotuloOrdem = ORDENS.find((o) => o.chave === ordem.chave)?.rotulo ?? "Ordem";
  const telaLarga = typeof window !== "undefined" && window.matchMedia("(min-width: 1600px)").matches;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-8 py-3 max-[860px]:px-4">
      <MenuSuspenso
        rotulo="Quais conversas mostrar"
        classeGatilho={BOTAO_BORDA}
        largura="w-72"
        conteudoGatilho={
          <>
            {contexto === "trabalho" ? "Todos os clientes" : "Todas as conversas"}
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

      {ativos.map((f) => (
        <span
          key={f.chave}
          className="inline-flex h-7 items-center gap-1 rounded-control border border-line-2 bg-surface-2 pl-2.5 pr-1 text-[12.5px] text-fg max-[860px]:h-10"
        >
          {f.rotulo}
          <button
            type="button"
            onClick={f.tirar}
            aria-label={`Tirar o filtro ${typeof f.rotulo === "string" ? f.rotulo : ""}`.trim()}
            className="grid h-5 w-5 place-items-center rounded-[4px] text-fg-faint hover:bg-elevated hover:text-fg max-[860px]:h-8 max-[860px]:w-8"
          >
            <IcFechar className="h-3 w-3" />
          </button>
        </span>
      ))}

      <MenuSuspenso
        rotulo="Acrescentar filtro"
        classeGatilho={`${BOTAO} border border-dashed border-line-2 text-fg-dim hover:border-fg-mute hover:text-fg`}
        conteudoGatilho={
          <>
            <IcMais className="h-3.5 w-3.5" />
            Filtro
          </>
        }
      >
        {(fechar) => {
          const escolher = (p: Partial<FiltrosExtras>) => {
            mudar(p);
            fechar();
          };
          return (
            <>
              <ItemMenu tipo="caixa" marcado={filtros.esperando} aoEscolher={() => escolher({ esperando: !filtros.esperando })}>
                Esperando resposta
              </ItemMenu>
              <DivisorMenu />
              <SecaoMenu>Tipo</SecaoMenu>
              <ItemMenu tipo="radio" marcado={filtros.tipo === "grupo"} aoEscolher={() => escolher({ tipo: filtros.tipo === "grupo" ? null : "grupo" })}>
                Só grupos
              </ItemMenu>
              <ItemMenu tipo="radio" marcado={filtros.tipo === "dm"} aoEscolher={() => escolher({ tipo: filtros.tipo === "dm" ? null : "dm" })}>
                Só conversas diretas
              </ItemMenu>
              <DivisorMenu />
              <SecaoMenu>Contrato</SecaoMenu>
              {CONTRATOS.map((c) => (
                <ItemMenu
                  key={c.valor}
                  tipo="radio"
                  marcado={filtros.contrato === c.valor}
                  aoEscolher={() => escolher({ contrato: filtros.contrato === c.valor ? null : c.valor })}
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
                      aoEscolher={() => escolher({ etiqueta: filtros.etiqueta === e ? null : e })}
                    >
                      {e}
                    </ItemMenu>
                  ))}
                </>
              )}
            </>
          );
        }}
      </MenuSuspenso>

      <label className="relative flex items-center max-[860px]:w-full max-[860px]:order-last">
        <IcBusca className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-fg-faint" />
        <span className="sr-only">Buscar cliente pelo nome</span>
        <input
          type="search"
          value={busca}
          onChange={(e) => aoBuscar(e.target.value)}
          placeholder="Buscar cliente…"
          className="h-7 w-52 rounded-control border border-line bg-surface pl-8 pr-2.5 text-[12.5px] text-fg placeholder:text-fg-faint focus:border-line-2 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent max-[860px]:h-10 max-[860px]:w-full max-[860px]:text-[16px]"
        />
      </label>

      <span className="flex-1" />

      <RadarBadge onClick={() => mudar({ esperando: true })} />

      <button
        type="button"
        aria-pressed={metricasAbertas}
        onClick={aoAlternarMetricas}
        className={cn(BOTAO_FANTASMA, metricasAbertas && "bg-elevated text-fg")}
      >
        <IcAtividade className="h-4 w-4" />
        Atividade
      </button>

      <MenuSuspenso
        rotulo="Ordenar clientes"
        alinhar="direita"
        classeGatilho={BOTAO_FANTASMA}
        conteudoGatilho={
          <>
            <IcOrdem className="h-4 w-4" />
            {rotuloOrdem}
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
          alinhar="direita"
          classeGatilho={BOTAO_FANTASMA}
          conteudoGatilho={
            <>
              <IcColunas className="h-4 w-4" />
              Colunas
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
    </div>
  );
}
