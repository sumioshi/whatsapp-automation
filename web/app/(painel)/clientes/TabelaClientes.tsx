"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { EditorEtiquetas } from "@/app/components/Etiqueta";
import { useRotas } from "@/app/components/RotasPainel";
import { AnelEspera, Avatar, Contador, Etiqueta, MedidorUso, MiniBarras, cn } from "@/app/components/ui";
import type { ClienteLinha } from "@/lib/clientes";
import { type ColunaId, type DefColuna, classeDaColuna, type EscolhaColunas } from "@/lib/clientes-colunas";
import {
  type ChaveOrdem,
  DIAS_ATIVIDADE,
  type Ordem,
  type TomContrato,
  type TotaisTabela,
  diaEMes,
  formatarReais,
  rotuloDoContrato,
  rotuloUltimaMsg,
} from "@/lib/clientes-tabela";
import {
  IcCalendario,
  IcCheck,
  IcConversa,
  IcDoc,
  IcEtiqueta,
  IcGrafico,
  IcHash,
  IcMais,
  IcNota,
  IcPessoas,
  IcRelogio,
  IcSilencio,
  IcSincronizar,
} from "./icones";

const ICONE: Record<ColunaId | "cliente", ReactNode> = {
  cliente: <IcPessoas className="h-3.5 w-3.5" />,
  tipo: <IcHash className="h-3.5 w-3.5" />,
  etiquetas: <IcEtiqueta className="h-3.5 w-3.5" />,
  contrato: <IcDoc className="h-3.5 w-3.5" />,
  uso: <IcGrafico className="h-3.5 w-3.5" />,
  atividade: <IcGrafico className="h-3.5 w-3.5" />,
  entregas: <IcCheck className="h-3.5 w-3.5" />,
  esperando: <IcRelogio className="h-3.5 w-3.5" />,
  ultima: <IcConversa className="h-3.5 w-3.5" />,
  renovacao: <IcCalendario className="h-3.5 w-3.5" />,
  msgsEntrega: <IcGrafico className="h-3.5 w-3.5" />,
  valorEntrega: <IcDoc className="h-3.5 w-3.5" />,
  equipe: <IcPessoas className="h-3.5 w-3.5" />,
  previa: <IcConversa className="h-3.5 w-3.5" />,
  nota: <IcNota className="h-3.5 w-3.5" />,
};

const PONTO: Record<TomContrato, string> = {
  ok: "bg-ok",
  warn: "bg-warn-mark",
  danger: "bg-danger",
  neutro: "bg-fg-mute",
  mudo: "bg-line-2",
};

const VAZIO = <span className="text-fg-mute">—</span>;

const TH =
  "sticky top-0 h-[38px] whitespace-nowrap border-b border-line bg-surface-2 px-3 text-left text-[12px] font-medium text-fg-dim";
const TD = "h-12 whitespace-nowrap border-b border-line px-3 group-hover:bg-surface-2";
const TF = "sticky bottom-0 h-10 whitespace-nowrap border-t border-line bg-surface-2 px-3 font-mono text-[12px] tabular-nums text-fg-faint";
/** Etiquetas que cabem na célula; o resto vira "+N" com a lista no title. */
const ETIQUETAS_NA_LINHA = 2;
/** A primeira coluna fica presa à esquerda quando a tabela rola para o lado. */
const PRESA = "sticky left-0 border-r border-line pl-8 max-[860px]:pl-4";

export function TabelaClientes({
  linhas,
  colunas,
  escolha,
  ordem,
  aoOrdenar,
  totais,
  conhecidas,
  agoraMs,
  vazio,
}: {
  linhas: ClienteLinha[];
  colunas: DefColuna[];
  escolha: EscolhaColunas;
  ordem: Ordem;
  aoOrdenar: (chave: ChaveOrdem) => void;
  totais: TotaisTabela;
  conhecidas: string[];
  agoraMs: number;
  /** Mostrado no lugar das linhas quando o filtro não deixa ninguém. */
  vazio: ReactNode;
}) {
  const algumLimite = linhas.some((l) => l.limite !== null);
  const rodape: Partial<Record<ColunaId, ReactNode>> = {
    contrato: totais.somaMensal > 0 ? `soma ${formatarReais(totais.somaMensal)}` : null,
    uso: algumLimite ? `${totais.acima} acima` : null,
    entregas: totais.entregas30d,
    esperando: `${totais.esperando} esperando`,
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-surface">
      <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-[13px] text-fg">
        <thead>
          <tr>
            <Cabecalho
              rotulo="Cliente"
              icone={ICONE.cliente}
              chave="nome"
              ordem={ordem}
              aoOrdenar={aoOrdenar}
              className={cn(PRESA, "z-[3]")}
            />
            {colunas.map((c) => (
              <Cabecalho
                key={c.id}
                rotulo={c.cabecalho ?? c.rotulo}
                descricao={c.rotulo}
                icone={ICONE[c.id]}
                chave={c.ordem}
                ordem={ordem}
                aoOrdenar={aoOrdenar}
                direita={c.direita}
                className={cn("z-[2]", classeDaColuna(c, escolha))}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? (
            <tr>
              <td colSpan={colunas.length + 1} className="border-b border-line">
                {vazio}
              </td>
            </tr>
          ) : (
            linhas.map((l) => (
              <Linha key={l.slug} l={l} colunas={colunas} escolha={escolha} conhecidas={conhecidas} agoraMs={agoraMs} />
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <td className={cn(TF, PRESA, "z-[3]")}>
              {totais.clientes} {totais.clientes === 1 ? "cliente" : "clientes"}
            </td>
            {colunas.map((c) => (
              <td key={c.id} className={cn(TF, "z-[2]", c.direita && "text-right", classeDaColuna(c, escolha))}>
                {rodape[c.id] ?? null}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Cabecalho({
  rotulo,
  descricao,
  icone,
  chave,
  ordem,
  aoOrdenar,
  direita,
  className,
}: {
  rotulo: string;
  /** Nome inteiro da coluna, quando o cabeçalho é encurtado ("Entregas" → "Entregas em 30 dias"). */
  descricao?: string;
  icone: ReactNode;
  chave?: ChaveOrdem;
  ordem: Ordem;
  aoOrdenar: (chave: ChaveOrdem) => void;
  direita?: boolean;
  className?: string;
}) {
  const ativa = chave !== undefined && ordem.chave === chave;
  // "Esperando" é a ordem do servidor: não tem sentido crescente.
  const sentido = ativa && chave !== "espera" ? (ordem.desc ? "descending" : "ascending") : undefined;
  const conteudo = (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-fg-faint">{icone}</span>
      <span>{rotulo}</span>
      {ativa && (
        <span aria-hidden className="text-[10px] text-accent">
          {chave === "espera" ? "●" : ordem.desc ? "▼" : "▲"}
        </span>
      )}
    </span>
  );
  return (
    <th scope="col" aria-sort={sentido} className={cn(TH, direita && "text-right", className)}>
      {chave ? (
        <button
          type="button"
          onClick={() => aoOrdenar(chave)}
          title={`Ordenar por ${(descricao ?? rotulo).toLowerCase()}`}
          className={cn("rounded-[4px] hover:text-fg focus-visible:outline-2 focus-visible:outline-accent", ativa && "text-fg")}
        >
          {conteudo}
        </button>
      ) : (
        conteudo
      )}
    </th>
  );
}

function Linha({
  l,
  colunas,
  escolha,
  conhecidas,
  agoraMs,
}: {
  l: ClienteLinha;
  colunas: DefColuna[];
  escolha: EscolhaColunas;
  conhecidas: string[];
  agoraMs: number;
}) {
  const router = useRouter();
  const rotas = useRotas();
  const href = rotas.chat(l.slug);
  return (
    <tr
      className={cn("group cursor-pointer", l.silenciado && "[&>td>*]:opacity-60")}
      onClick={(e) => {
        // Linha inteira abre a conversa; botões, links e o editor de etiquetas não.
        if ((e.target as HTMLElement).closest("a,button,input,form,[data-editor]")) return;
        router.push(href);
      }}
    >
      <td className={cn(TD, PRESA, "z-[1] bg-surface")}>
        {/* Nome longo quebra em até duas linhas na largura da coluna, sem reticências no meio da palavra. */}
        <span className="flex w-[248px] items-center gap-2.5 max-[860px]:w-[188px]">
          <Avatar nome={l.nome} tipo={l.tipo} fotoUrl={l.avatarPath ? rotas.midia(l.avatarPath) : null} tamanho="sm" />
          <Link
            href={href}
            className="line-clamp-2 min-w-0 whitespace-normal break-words font-medium leading-[1.3] text-fg hover:text-accent"
            title={l.nome}
          >
            {l.nome}
          </Link>
          <Contador n={l.naoLidas} destaque={!l.silenciado} />
          {l.silenciado && (
            <span title="Silenciado" className="text-fg-faint">
              <IcSilencio className="h-3.5 w-3.5" />
              <span className="sr-only">silenciado</span>
            </span>
          )}
          {l.nota && (
            <span title={l.nota} className="text-fg-faint">
              <IcNota className="h-3.5 w-3.5" />
              <span className="sr-only">nota: {l.nota}</span>
            </span>
          )}
        </span>
      </td>
      {colunas.map((c) => (
        <Celula key={c.id} c={c} l={l} escolha={escolha} conhecidas={conhecidas} agoraMs={agoraMs} />
      ))}
    </tr>
  );
}

function Celula({
  c,
  l,
  escolha,
  conhecidas,
  agoraMs,
}: {
  c: DefColuna;
  l: ClienteLinha;
  escolha: EscolhaColunas;
  conhecidas: string[];
  agoraMs: number;
}) {
  const classe = cn(TD, c.direita && "text-right", classeDaColuna(c, escolha));
  switch (c.id) {
    case "tipo":
      return <td className={classe}>{l.tipo === "dm" ? "DM" : "Grupo"}</td>;
    case "etiquetas":
      return (
        <td className={classe}>
          <EtiquetasDaLinha slug={l.slug} iniciais={l.etiquetas} conhecidas={conhecidas} />
        </td>
      );
    case "contrato": {
      const r = rotuloDoContrato(l.contrato, agoraMs);
      const valor = formatarReais(l.contrato.valorMensal);
      return (
        <td className={classe}>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", PONTO[r.tom])} />
            <span className={r.tom === "mudo" ? "text-fg-faint" : r.tom === "danger" ? "text-danger" : "text-fg"}>{r.texto}</span>
          </span>
          {valor && <span className="ml-2 font-mono tabular-nums text-fg-faint">{valor}</span>}
        </td>
      );
    }
    case "uso":
      return (
        <td className={classe}>
          {l.limite === null ? (
            <span className="text-[12.5px] text-fg-mute">sem limite</span>
          ) : (
            <MedidorUso
              compacto
              valor={l.msgsCliente30d}
              limite={l.limite}
              rotuloAcessivel={`Mensagens de ${l.nome} em 30 dias contra o limite do contrato`}
              className="w-[132px]"
            />
          )}
        </td>
      );
    case "atividade":
      return (
        <td className={classe}>
          <MiniBarras
            valores={l.atividade30d}
            limiteDiario={l.limite ? l.limite / DIAS_ATIVIDADE : undefined}
            rotulo={`Mensagens do cliente nos últimos ${DIAS_ATIVIDADE} dias, por dia: ${l.atividade30d.reduce((a, b) => a + b, 0)} no total`}
          />
        </td>
      );
    case "entregas":
      return <td className={cn(classe, "font-mono tabular-nums")}>{l.entregas30d}</td>;
    case "esperando":
      return <td className={classe}>{l.aguardando ? <AnelEspera ms={l.waitingMs} /> : VAZIO}</td>;
    case "ultima":
      return (
        <td className={cn(classe, "font-mono tabular-nums text-fg-dim")} title={l.ultimaPreview ?? undefined}>
          <span className="inline-flex items-center gap-1.5">
            {l.desatualizado && (
              <span title="O WhatsApp tem atividade mais nova que a última mensagem guardada; a sincronização vai buscar." className="text-warn">
                <IcSincronizar className="h-3.5 w-3.5" />
                <span className="sr-only">pode estar desatualizado</span>
              </span>
            )}
            {rotuloUltimaMsg(l.ultimaTimestamp, agoraMs)}
          </span>
        </td>
      );
    case "renovacao":
      return <td className={cn(classe, "font-mono tabular-nums text-fg-dim")}>{l.contrato.fim ? diaEMes(l.contrato.fim, agoraMs) : VAZIO}</td>;
    case "msgsEntrega":
      return (
        <td className={cn(classe, "font-mono tabular-nums text-fg-dim")}>
          {l.msgsPorEntrega === null ? VAZIO : Math.round(l.msgsPorEntrega)}
        </td>
      );
    case "valorEntrega":
      return (
        <td className={cn(classe, "font-mono tabular-nums text-fg-dim")}>
          {l.valorPorEntrega === null ? VAZIO : formatarReais(Math.round(l.valorPorEntrega))}
        </td>
      );
    case "equipe":
      return <td className={cn(classe, "text-fg-dim")}>{l.equipe.length ? l.equipe.join(", ") : VAZIO}</td>;
    case "previa":
      return (
        <td className={cn(classe, "text-fg-dim")} title={l.ultimaPreview ?? undefined}>
          {l.ultimaPreview ? <span className="block max-w-[320px] truncate">{l.ultimaPreview}</span> : VAZIO}
        </td>
      );
    case "nota":
      return (
        <td className={cn(classe, "text-fg-dim")} title={l.nota ?? undefined}>
          {l.nota ? <span className="block max-w-[280px] truncate">{l.nota}</span> : VAZIO}
        </td>
      );
  }
}

/** Etiquetas da linha: a célula toda abre o editor de sempre (sem botão extra ocupando largura). */
function EtiquetasDaLinha({ slug, iniciais, conhecidas }: { slug: string; iniciais: string[]; conhecidas: string[] }) {
  const [etiquetas, setEtiquetas] = useState(iniciais);
  const [editando, setEditando] = useState(false);
  const resto = etiquetas.slice(ETIQUETAS_NA_LINHA);
  return (
    <span className="relative inline-flex" data-editor>
      <button
        type="button"
        aria-label={etiquetas.length ? `Editar etiquetas: ${etiquetas.join(", ")}` : "Pôr etiqueta"}
        aria-expanded={editando}
        title={etiquetas.length ? "Editar etiquetas" : "Pôr etiqueta"}
        onClick={() => setEditando((v) => !v)}
        className="-mx-1.5 flex min-h-7 items-center gap-1 rounded-[6px] px-1.5 transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:outline-accent"
      >
        {etiquetas.length === 0 ? (
          <>
            <span className="text-fg-mute group-hover:hidden [@media(hover:none)]:hidden">—</span>
            <span className="hidden items-center gap-1 text-[12px] text-fg-faint group-hover:inline-flex [@media(hover:none)]:inline-flex">
              <IcMais className="h-3 w-3" />
              etiqueta
            </span>
          </>
        ) : (
          <>
            {etiquetas.slice(0, ETIQUETAS_NA_LINHA).map((e) => (
              <Etiqueta key={e} nome={e} tamanho="sm" />
            ))}
            {resto.length > 0 && (
              <span
                title={resto.join(", ")}
                className="inline-flex h-5 items-center rounded-full bg-elevated px-1.5 font-mono text-[11px] tabular-nums text-fg-dim"
              >
                +{resto.length}
              </span>
            )}
          </>
        )}
      </button>
      {editando && (
        <EditorEtiquetas slug={slug} atuais={etiquetas} conhecidas={conhecidas} onSalvo={setEtiquetas} onFechar={() => setEditando(false)} />
      )}
    </span>
  );
}
