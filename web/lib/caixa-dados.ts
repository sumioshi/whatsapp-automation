import { open, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { cache } from 'react';
import {
  type AguardandoOk,
  type ConversaFila,
  type DadosFila,
  type EntregaViva,
  type EsperaFila,
  type EventoEntrega,
  OK_VALIDO_MS,
} from './caixa';
import { type GroupSummary, listGroups } from './data';
import { listarDespachos } from './despacho-store';
import { buildInbox, type InboxItem } from './inbox';
import { CONTROL_URL, DATA_DIR } from './paths';

/**
 * Dados da Caixa lidos no servidor (layout e rota). A parte pura mora em
 * `./caixa`; aqui só se junta o que vem do disco e do coletor.
 */

/** Lista de conversas uma vez por renderização: o trilho e a fila dividem a mesma leitura. */
export const conversasDaRequisicao = cache(() => listGroups());

export function paraEspera(i: InboxItem): EsperaFila {
  return { slug: i.slug, nome: i.groupName, motivo: i.reason, de: i.who, previa: i.preview, desde: i.waitingSince };
}

export function paraConversa(g: GroupSummary): ConversaFila {
  return {
    slug: g.slug,
    nome: g.name,
    avatarPath: g.avatarPath,
    previa: g.lastPreview,
    ultimaEm: g.lastTimestamp,
    naoLidas: g.unread,
    fixada: Boolean(g.pinned),
    silenciada: Boolean(g.muted),
    arquivada: Boolean(g.archived),
    etiquetas: g.etiquetas ?? [],
  };
}

export interface IaDaCaixa {
  entregas: EntregaViva[];
  aguardandoOk: AguardandoOk[];
}

/** Coletor fora do ar não pode segurar a tela: a fila da IA some, o resto aparece. */
const ESPERA_COLETOR_MS = 1500;

async function entregasVivas(): Promise<EntregaViva[]> {
  try {
    const res = await fetch(`${CONTROL_URL}/entregas`, { cache: 'no-store', signal: AbortSignal.timeout(ESPERA_COLETOR_MS) });
    if (!res.ok) return [];
    const data = (await res.json()) as { entregas?: Array<Partial<EntregaViva>> };
    return (data.entregas ?? [])
      .filter((e): e is EntregaViva => typeof e.ticket === 'string' && typeof e.slug === 'string' && typeof e.estado === 'string')
      .map((e) => ({
        ticket: e.ticket,
        slug: e.slug,
        estado: e.estado,
        enviados: Number(e.enviados) || 0,
        total: Number(e.total) || 0,
        entregarEm: String(e.entregarEm ?? ''),
      }));
  } catch {
    return [];
  }
}

/** Um dia de folga além da validade da pergunta: a passada vem no fuso do operador, não em UTC. */
const JANELA_DESPACHO_MS = OK_VALIDO_MS + 24 * 60 * 60_000;

/** Perguntas da triagem para o cliente que ainda esperam o "ok N" do operador (só as recentes). */
async function perguntasPendentes(): Promise<AguardandoOk[]> {
  const out: AguardandoOk[] = [];
  const desde = `${new Date(Date.now() - JANELA_DESPACHO_MS).toISOString().slice(0, 10)}T0000`;
  for (const arquivo of await listarDespachos({ desde })) {
    for (const item of arquivo.itens) {
      if (item.acao !== 'enviar' || item.executadoEm) continue;
      out.push({ slug: item.slug, n: item.n, texto: item.texto ?? item.titulo, desde: arquivo.criadoEm });
    }
  }
  // A mais nova primeiro: a fila mostra uma linha por chat.
  return out.sort((a, b) => b.desde.localeCompare(a.desde));
}

/** Fila do dono: quem espera, as conversas e o que a IA está fazendo. */
export async function filaDoDono(): Promise<DadosFila> {
  const [inbox, grupos, ia] = await Promise.all([buildInbox(), conversasDaRequisicao(), iaDaCaixa()]);
  return {
    esperando: inbox.map(paraEspera),
    conversas: grupos.map(paraConversa),
    entregas: ia.entregas,
    aguardandoOk: ia.aguardandoOk,
    geradoEm: Date.now(),
  };
}

/**
 * Fila de quem atende: só os chats liberados. O "silenciado" é organização do
 * dono e não tira ninguém da fila; a DM partida em telefone × LID é uma conversa só.
 */
export async function filaDaEquipe(
  chats: ReadonlySet<string>,
  canonicoDe: (slug: string) => string,
  lista: GroupSummary[],
): Promise<DadosFila> {
  const inbox = await buildInbox({ slugs: chats, ignorarSilenciados: true, canonicoDe });
  return { esperando: inbox.map(paraEspera), conversas: lista.map(paraConversa), entregas: [], aguardandoOk: [], geradoEm: Date.now() };
}

/** O que a IA está fazendo agora: entregas na fila e perguntas esperando o OK. */
export async function iaDaCaixa(): Promise<IaDaCaixa> {
  const [entregas, aguardandoOk] = await Promise.all([entregasVivas(), perguntasPendentes().catch(() => [])]);
  return { entregas, aguardandoOk };
}

/** O registro de entregas só cresce: lê o fim dele (o bastante para semanas de conversa). */
const TETO_REGISTRO = 4 * 1024 * 1024;

async function fimDoRegistro(caminho: string, tamanho: number): Promise<string> {
  const h = await open(caminho, 'r');
  try {
    const inicio = Math.max(0, tamanho - TETO_REGISTRO);
    const buf = Buffer.alloc(tamanho - inicio);
    await h.read(buf, 0, buf.length, inicio);
    const texto = buf.toString('utf8');
    // Começou no meio de uma linha: descarta o pedaço.
    return inicio > 0 ? texto.slice(texto.indexOf('\n') + 1) : texto;
  } finally {
    await h.close();
  }
}

function paraEvento(linha: string): EventoEntrega | null {
  try {
    const e = JSON.parse(linha) as Partial<EventoEntrega>;
    if (typeof e.slug !== 'string' || typeof e.ticket !== 'string' || typeof e.estado !== 'string' || typeof e.ts !== 'string') return null;
    return {
      ts: e.ts,
      ticket: e.ticket,
      slug: e.slug,
      estado: e.estado,
      motivo: typeof e.motivo === 'string' ? e.motivo : null,
      enviados: Number(e.enviados) || 0,
      total: Number(e.total) || 0,
      iniciadoEm: typeof e.iniciadoEm === 'string' ? e.iniciadoEm : null,
    };
  } catch {
    return null; // linha cortada no meio da escrita
  }
}

/** Leitura guardada até o registro mudar de tamanho ou de data: a conversa consulta a cada 10 s. */
let registro: { mtimeMs: number; size: number; eventos: EventoEntrega[] } | null = null;

/** Transições das entregas da IA numa conversa, desde um instante (o registro que o coletor grava). */
export async function eventosDaConversa(slug: string, desde = ''): Promise<EventoEntrega[]> {
  const caminho = join(DATA_DIR, '.entregas.jsonl');
  try {
    const st = await stat(caminho);
    if (!registro || registro.mtimeMs !== st.mtimeMs || registro.size !== st.size) {
      const eventos = (await fimDoRegistro(caminho, st.size))
        .split('\n')
        .map(paraEvento)
        .filter((e): e is EventoEntrega => e !== null);
      registro = { mtimeMs: st.mtimeMs, size: st.size, eventos };
    }
  } catch {
    return [];
  }
  return registro.eventos.filter((e) => e.slug === slug && (!desde || e.ts >= desde));
}
