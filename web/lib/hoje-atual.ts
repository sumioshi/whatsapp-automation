import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { readStatus } from './config';
import { montarDashboardAtual } from './dashboard-atual';
import { listGroups } from './data';
import { listarFeatures } from './features';
import {
  type ContratoNoLimite,
  contratosNoLimite,
  dataPorExtenso,
  type EstadoColetor,
  estadoDoColetor,
  interrompidasHoje,
  resumoEsperando,
  type SinalDoDia,
  sinaisDoDia,
} from './hoje';
import { buildInbox } from './inbox';
import { entregasPorMes, resumoDeHoje } from './painel';
import { conversasDoAtendimento } from './painel-atual';
import { DATA_DIR } from './paths';
import { readTriage } from './triage';

/** Quantas linhas cada card do Hoje mostra (cabem na altura padrão do card). */
const LINHAS_POR_CARD = 5;
/** Um dia de transições da fila cabe com folga no fim do registro de entregas. */
const FIM_DO_REGISTRO = 256 * 1024;

export interface ChatHoje {
  nome: string;
  avatarPath: string | null;
}

export interface LinhaEsperando {
  slug: string;
  nome: string;
  avatarPath: string | null;
  etiqueta: string | null;
  mencao: boolean;
  quem: string;
  previa: string;
  waitingMs: number;
  naoLidas: number;
}

export interface DadosHoje {
  agoraMs: number;
  /** "Segunda, 12 de outubro". */
  data: string;
  coletor: { estado: EstadoColetor; grupos: number };
  esperando: { total: number; acimaDe4h: number; linhas: LinhaEsperando[] };
  primeiraResposta: { medianaMs: number | null; respostas: number };
  entregas: { atual: number; anterior: number; nomeMes: string; nomeMesAnterior: string };
  ia: { enviadasHoje: number; interrompidasHoje: number; autonomo: number };
  sinais: { total: number; itens: Array<SinalDoDia & ChatHoje> };
  limites: { total: number; itens: Array<ContratoNoLimite & ChatHoje> };
  /** Nome e foto por slug, para a fila da IA (que só traz o slug) achar o chat. */
  chats: Record<string, ChatHoje>;
}

/** O fim de um arquivo grande (sem a primeira linha, que pode vir cortada). */
async function fimDoArquivo(caminho: string, bytes: number): Promise<string> {
  let arquivo: Awaited<ReturnType<typeof open>>;
  try {
    arquivo = await open(caminho, 'r');
  } catch {
    return '';
  }
  try {
    const { size } = await arquivo.stat();
    const inicio = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - inicio);
    await arquivo.read(buf, 0, buf.length, inicio);
    const texto = buf.toString('utf8');
    return inicio > 0 ? texto.slice(texto.indexOf('\n') + 1) : texto;
  } finally {
    await arquivo.close();
  }
}

/** Transições recentes da fila de envio que o coletor registra (só existe onde ele roda). */
async function transicoesRecentes(): Promise<Array<{ ts: string; ticket: string; estado: string }>> {
  const linhas: Array<{ ts: string; ticket: string; estado: string }> = [];
  for (const linha of (await fimDoArquivo(join(DATA_DIR, '.entregas.jsonl'), FIM_DO_REGISTRO)).split('\n')) {
    try {
      const l = JSON.parse(linha) as { ts?: unknown; ticket?: unknown; estado?: unknown };
      if (typeof l.ts === 'string' && typeof l.ticket === 'string' && typeof l.estado === 'string') {
        linhas.push({ ts: l.ts, ticket: l.ticket, estado: l.estado });
      }
    } catch {
      // linha vazia ou cortada
    }
  }
  return linhas;
}

/** Tudo o que a tela Hoje mostra e mora no disco do painel (agenda e fila vêm do navegador). */
export async function montarHojeAtual(): Promise<DadosHoje> {
  const agoraMs = Date.now();
  const [grupos, inbox, status, dashboard, features, triagem, conversas, transicoes] = await Promise.all([
    listGroups(),
    buildInbox(),
    readStatus(),
    montarDashboardAtual(),
    listarFeatures(),
    readTriage(),
    conversasDoAtendimento(),
    transicoesRecentes(),
  ]);

  const chats: Record<string, ChatHoje> = {};
  for (const g of grupos) chats[g.slug] = { nome: g.name, avatarPath: g.avatarPath };
  const porSlug = new Map(grupos.map((g) => [g.slug, g]));
  const chat = (slug: string, nome?: string): ChatHoje => chats[slug] ?? { nome: nome ?? slug, avatarPath: null };

  const sinais = sinaisDoDia(dashboard.linhas, inbox, agoraMs);
  const limites = contratosNoLimite(dashboard.linhas, agoraMs);
  const hoje = resumoDeHoje(conversas, agoraMs);
  const entregas = entregasPorMes(features, agoraMs);

  return {
    agoraMs,
    data: dataPorExtenso(agoraMs),
    coletor: { estado: estadoDoColetor(status), grupos: status.watchedCount },
    esperando: {
      ...resumoEsperando(inbox),
      linhas: inbox.slice(0, LINHAS_POR_CARD).map((i) => {
        const g = porSlug.get(i.slug);
        return {
          slug: i.slug,
          nome: i.groupName,
          avatarPath: g?.avatarPath ?? null,
          etiqueta: g?.etiquetas?.[0] ?? null,
          mencao: i.reason === 'mentioned',
          quem: i.who,
          previa: i.preview,
          waitingMs: i.waitingMs,
          naoLidas: g?.unread ?? 0,
        };
      }),
    },
    primeiraResposta: { medianaMs: hoje.medianaMs, respostas: hoje.respostas },
    entregas: {
      atual: entregas.atual,
      anterior: entregas.anterior,
      nomeMes: entregas.nomeMes,
      nomeMesAnterior: entregas.nomeMesAnterior,
    },
    ia: {
      enviadasHoje: hoje.iaEnviadas,
      interrompidasHoje: interrompidasHoje(transicoes, agoraMs),
      autonomo: Object.values(triagem.autonomo).filter(Boolean).length,
    },
    sinais: {
      total: sinais.length,
      itens: sinais.slice(0, LINHAS_POR_CARD).map((s) => ({ ...s, ...chat(s.slug, s.nome), nome: s.nome })),
    },
    limites: {
      total: limites.length,
      itens: limites.slice(0, LINHAS_POR_CARD).map((l) => ({ ...l, avatarPath: chat(l.slug).avatarPath })),
    },
    chats,
  };
}
