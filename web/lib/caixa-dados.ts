import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { cache } from 'react';
import type { AguardandoOk, ConversaFila, EntregaViva, EsperaFila, EventoEntrega } from './caixa';
import { type GroupSummary, listGroups } from './data';
import { listarDespachos } from './despacho-store';
import type { InboxItem } from './inbox';
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

/** Perguntas da triagem para o cliente que ainda esperam o "ok N" do operador. */
async function perguntasPendentes(): Promise<AguardandoOk[]> {
  const out: AguardandoOk[] = [];
  for (const arquivo of await listarDespachos()) {
    for (const item of arquivo.itens) {
      if (item.acao !== 'enviar' || item.executadoEm) continue;
      out.push({ slug: item.slug, n: item.n, texto: item.texto ?? item.titulo, desde: arquivo.criadoEm });
    }
  }
  // A mais nova primeiro: a fila mostra uma linha por chat.
  return out.sort((a, b) => b.desde.localeCompare(a.desde));
}

/** O que a IA está fazendo agora: entregas na fila e perguntas esperando o OK. */
export async function iaDaCaixa(): Promise<IaDaCaixa> {
  const [entregas, aguardandoOk] = await Promise.all([entregasVivas(), perguntasPendentes().catch(() => [])]);
  return { entregas, aguardandoOk };
}

/** O registro de entregas só cresce: lê o fim dele (o bastante para semanas de conversa). */
const TETO_REGISTRO = 4 * 1024 * 1024;

async function fimDoRegistro(caminho: string): Promise<string> {
  const h = await open(caminho, 'r');
  try {
    const { size } = await h.stat();
    const inicio = Math.max(0, size - TETO_REGISTRO);
    const buf = Buffer.alloc(size - inicio);
    await h.read(buf, 0, buf.length, inicio);
    const texto = buf.toString('utf8');
    // Começou no meio de uma linha: descarta o pedaço.
    return inicio > 0 ? texto.slice(texto.indexOf('\n') + 1) : texto;
  } finally {
    await h.close();
  }
}

/** Transições das entregas da IA numa conversa, desde um instante (o registro que o coletor grava). */
export async function eventosDaConversa(slug: string, desde = ''): Promise<EventoEntrega[]> {
  let texto: string;
  try {
    texto = await fimDoRegistro(join(DATA_DIR, '.entregas.jsonl'));
  } catch {
    return [];
  }
  const out: EventoEntrega[] = [];
  for (const linha of texto.split('\n')) {
    if (!linha.includes(slug)) continue;
    try {
      const e = JSON.parse(linha) as Partial<EventoEntrega>;
      if (e.slug !== slug || typeof e.ticket !== 'string' || typeof e.estado !== 'string' || typeof e.ts !== 'string') continue;
      if (desde && e.ts < desde) continue;
      out.push({
        ts: e.ts,
        ticket: e.ticket,
        slug: e.slug,
        estado: e.estado,
        motivo: typeof e.motivo === 'string' ? e.motivo : null,
        enviados: Number(e.enviados) || 0,
        total: Number(e.total) || 0,
        iniciadoEm: typeof e.iniciadoEm === 'string' ? e.iniciadoEm : null,
      });
    } catch {
      /* linha cortada no meio da escrita */
    }
  }
  return out;
}
