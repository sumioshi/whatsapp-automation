"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, CabecalhoPagina, EmptyState, Segmentado } from "@/app/components/ui";
import type { ClienteLinha } from "@/lib/clientes";
import { type ColunaId, type EscolhaColunas, alternarColuna, colunasDoHtml } from "@/lib/clientes-colunas";
import {
  type ChaveOrdem,
  type Ordem,
  contagemDosSegmentos,
  ehTrabalho,
  filtrarLinhas,
  ordenarLinhas,
  totaisDaTabela,
} from "@/lib/clientes-tabela";
import type { KanbanState } from "@/lib/kanban";
import { BarraClientes, type FiltrosExtras } from "./BarraClientes";
import { KanbanBoard } from "./KanbanBoard";
import { MetricasResumo } from "./MetricasResumo";
import { TabelaClientes } from "./TabelaClientes";

type Modo = "tabela" | "quadro";
type Contexto = "trabalho" | "tudo";

/** O valor antigo "kanban" continua abrindo no Quadro. */
const CHAVE_MODO = "wac-clientes-modo";
const CHAVE_CTX = "wac-clientes-contexto";
const CHAVE_ORDEM = "wac-clientes-ordem";
const CHAVE_COLUNAS = "wac-clientes-colunas";
const CHAVE_METRICAS = "wac-metricas-aberto";
/** Etiquetas sugeridas antes do primeiro uso (as em uso nos chats somam a estas). */
const SEMENTES = ["Pessoal"];
const ORDEM_PADRAO: Ordem = { chave: "espera", desc: true };
const SEM_FILTRO: FiltrosExtras = { segmento: "todos", etiqueta: null, contrato: null };
const CHAVES_ORDEM: ChaveOrdem[] = ["espera", "uso", "atividade", "entregas", "ultima", "nome", "contrato"];

function ler(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string | null) {
  try {
    if (valor === null) window.localStorage.removeItem(chave);
    else window.localStorage.setItem(chave, valor);
  } catch {
    // Sem armazenamento local, a escolha vale só até recarregar.
  }
}

/** Tabela e Quadro dos clientes, com os filtros, a ordem e as colunas guardados no navegador. */
export function ClientesView({ linhas, kanban, agoraMs }: { linhas: ClienteLinha[]; kanban: KanbanState; agoraMs: number }) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("tabela");
  const [contexto, setContexto] = useState<Contexto>("trabalho");
  const [filtros, setFiltros] = useState<FiltrosExtras>(SEM_FILTRO);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>(ORDEM_PADRAO);
  const [escolha, setEscolha] = useState<EscolhaColunas>(null);
  const [metricas, setMetricas] = useState(false);

  // Mantém a tela viva: atualiza a cada 15 s, parado com a aba escondida.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15_000);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    if (ler(CHAVE_MODO) === "kanban") setModo("quadro");
    if (ler(CHAVE_CTX) === "tudo") setContexto("tudo");
    if (ler(CHAVE_METRICAS) === "1") setMetricas(true);
    try {
      const o = JSON.parse(ler(CHAVE_ORDEM) ?? "null") as Partial<Ordem> | null;
      if (o && CHAVES_ORDEM.includes(o.chave as ChaveOrdem)) setOrdem({ chave: o.chave as ChaveOrdem, desc: o.desc !== false });
      const c = JSON.parse(ler(CHAVE_COLUNAS) ?? "null") as unknown;
      if (c && typeof c === "object" && !Array.isArray(c)) setEscolha(c as EscolhaColunas);
    } catch {
      // Escolha guardada ilegível: fica o padrão.
    }
  }, []);

  const conhecidas = useMemo(() => [...new Set([...SEMENTES, ...linhas.flatMap((c) => c.etiquetas)])], [linhas]);
  const doContexto = contexto === "trabalho" ? linhas.filter(ehTrabalho) : linhas;
  const esperando = doContexto.filter((l) => l.aguardando && !l.silenciado).length;
  const todosFiltros = { contexto, busca, ...filtros };
  const visiveis = ordenarLinhas(filtrarLinhas(linhas, todosFiltros, agoraMs), ordem);
  const contagem = contagemDosSegmentos(linhas, todosFiltros, agoraMs);
  const comFiltro = busca.trim() !== "" || filtros.segmento !== "todos" || filtros.etiqueta !== null || filtros.contrato !== null;

  function trocarModo(m: Modo) {
    setModo(m);
    gravar(CHAVE_MODO, m === "quadro" ? "kanban" : "grade");
  }
  function trocarContexto(c: Contexto) {
    setContexto(c);
    gravar(CHAVE_CTX, c);
  }
  function trocarOrdem(o: Ordem) {
    setOrdem(o);
    gravar(CHAVE_ORDEM, JSON.stringify(o));
  }
  /** Clique no cabeçalho: a mesma coluna inverte o sentido; outra começa do maior (nome, de A a Z). */
  function ordenarPor(chave: ChaveOrdem) {
    trocarOrdem(ordem.chave === chave && chave !== "espera" ? { chave, desc: !ordem.desc } : { chave, desc: chave !== "nome" });
  }
  function alternar(id: ColunaId) {
    const nova = alternarColuna(escolha, id, window.matchMedia("(min-width: 1600px)").matches);
    setEscolha(nova);
    gravar(CHAVE_COLUNAS, JSON.stringify(nova));
  }
  function restaurarColunas() {
    setEscolha(null);
    gravar(CHAVE_COLUNAS, null);
  }
  function alternarMetricas() {
    setMetricas((m) => {
      gravar(CHAVE_METRICAS, m ? "0" : "1");
      return !m;
    });
  }
  function limparFiltros() {
    setFiltros(SEM_FILTRO);
    setBusca("");
  }

  const total = doContexto.length;
  const subtitulo =
    contexto === "trabalho"
      ? `${total} ${total === 1 ? "cliente" : "clientes"}`
      : `${total} ${total === 1 ? "conversa" : "conversas"}, pessoais incluídas`;

  const vazio = comFiltro ? (
    <EmptyState
      title="Nenhum cliente com esses filtros"
      description="Tire um filtro ou mude a busca para ver mais gente."
      acao={
        <Button variant="subtle" size="sm" onClick={limparFiltros}>
          Limpar filtros
        </Button>
      }
    />
  ) : (
    <EmptyState
      title={contexto === "trabalho" ? "Nenhum cliente ainda" : "Nenhuma conversa ainda"}
      description={
        contexto === "trabalho"
          ? "Grupos monitorados e conversas com etiqueta de empresa, contrato ou entrega aparecem aqui. As outras ficam em Todas as conversas."
          : "As conversas aparecem aqui assim que o coletor guardar a primeira mensagem."
      }
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CabecalhoPagina
        variante="barra"
        titulo="Clientes"
        subtitulo={
          <span className="max-[860px]:hidden">
            {subtitulo}
            {esperando > 0 && (
              <>
                {" · "}
                <span className="font-mono tabular-nums">{esperando}</span> esperando resposta
              </>
            )}
          </span>
        }
        acoes={
          <>
            <Segmentado<Modo>
              rotulo="Exibição"
              opcoes={[
                { valor: "tabela", rotulo: "Tabela" },
                { valor: "quadro", rotulo: "Quadro" },
              ]}
              valor={modo}
              aoMudar={trocarModo}
            />
          </>
        }
      />
      <BarraClientes
        contexto={contexto}
        aoMudarContexto={trocarContexto}
        filtros={filtros}
        aoMudarFiltros={setFiltros}
        contagem={contagem}
        busca={busca}
        aoBuscar={setBusca}
        etiquetas={conhecidas}
        ordem={ordem}
        aoOrdenar={trocarOrdem}
        escolha={escolha}
        aoAlternarColuna={alternar}
        aoRestaurarColunas={restaurarColunas}
        mostrarColunas={modo === "tabela"}
        metricasAbertas={metricas}
        aoAlternarMetricas={alternarMetricas}
      />
      {metricas && <MetricasResumo />}
      {modo === "tabela" ? (
        <TabelaClientes
          linhas={visiveis}
          colunas={colunasDoHtml(escolha)}
          escolha={escolha}
          ordem={ordem}
          aoOrdenar={ordenarPor}
          totais={totaisDaTabela(visiveis, agoraMs)}
          conhecidas={conhecidas}
          agoraMs={agoraMs}
          vazio={vazio}
        />
      ) : visiveis.length === 0 ? (
        <div className="flex-1 bg-bg">{vazio}</div>
      ) : (
        <KanbanBoard cards={visiveis} inicial={kanban} conhecidas={conhecidas} />
      )}
    </div>
  );
}
