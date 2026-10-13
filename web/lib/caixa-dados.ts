import { cache } from 'react';
import type { AguardandoOk, ConversaFila, EntregaViva, EsperaFila } from './caixa';
import { type GroupSummary, listGroups } from './data';
import { listarDespachos } from './despacho-store';
import type { InboxItem } from './inbox';
import { CONTROL_URL } from './paths';

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
