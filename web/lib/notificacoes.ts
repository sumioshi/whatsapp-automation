import { open, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { conversasDaRequisicao } from './caixa-dados';
import { conversationName, type MessageRecord } from './data';
import { DATA_DIR, safeDataPath } from './paths';
import { readTriage } from './triage';

export type TipoNotificacao = 'mensagem' | 'sistema';

export type EstadoSistemaNotificacao =
  | 'entregue'
  | 'interrompida'
  | 'entregando'
  | 'enfileirada'
  | 'falhou'
  | 'cancelada';

export interface NotificacaoItem {
  id: string;
  tipo: TipoNotificacao;
  slug: string;
  chatNome: string;
  remetente: string;
  texto: string;
  timestamp: string;
  estado?: EstadoSistemaNotificacao;
}

export interface EventoEntregaCru {
  ts?: string;
  timestamp?: string;
  ticket?: string;
  id?: string;
  slug?: string;
  chatNome?: string;
  estado?: string;
  motivo?: string | null;
  texto?: string | null;
  previa?: string | null;
  baloes?: string[];
  enviados?: number;
  total?: number;
}

const TYPE_LABEL: Record<string, string> = {
  audio: 'áudio',
  image: 'imagem',
  video: 'vídeo',
  gif: 'GIF',
  document: 'documento',
  sticker: 'figurinha',
  location: 'localização',
  contact: 'contato',
  poll: 'enquete',
  event: 'evento',
};

const JANELA_PADRAO_MS = 24 * 60 * 60_000;
const LIMITE_PADRAO = 30;
const CAUDA_MENSAGENS_BYTES = 128 * 1024;
const CAUDA_ENTREGAS_BYTES = 512 * 1024;

export function previaMensagemNotificacao(r: { text?: string | null; type?: string | null }): string {
  const body = r.text?.trim() ?? '';
  if (body) return body.length > 120 ? `${body.slice(0, 117)}…` : body;
  if (r.type && r.type !== 'text') return `[${TYPE_LABEL[r.type] ?? r.type}]`;
  return '[mensagem]';
}

export function normalizarEstadoEntrega(
  estado?: string | null,
  motivo?: string | null,
): EstadoSistemaNotificacao | null {
  const e = (estado ?? '').trim().toLowerCase();
  const m = (motivo ?? '').trim().toLowerCase();
  if (e === 'falhou' || e === 'falha' || m === 'falha') return 'falhou';
  if (e === 'interrompida' || e === 'interrompido') return 'interrompida';
  if (e === 'entregue') return 'entregue';
  if (e === 'entregando') return 'entregando';
  if (e === 'enfileirada' || e === 'enfileirado' || e === 'agendado' || e === 'agendada') {
    return 'enfileirada';
  }
  if (e === 'cancelada' || e === 'cancelado') return 'cancelada';
  return null;
}

export function textoNotificacaoEntrega(
  estado: EstadoSistemaNotificacao,
  previa?: string | null,
): string {
  const limpa = previa?.trim() ?? '';
  const curta = limpa.length > 90 ? `${limpa.slice(0, 87)}…` : limpa;
  switch (estado) {
    case 'entregue':
      return curta ? `IA respondeu na conversa: ${curta}` : 'IA respondeu na conversa';
    case 'interrompida':
      return 'Entrega da IA interrompida (nova mensagem ou envio manual)';
    case 'enfileirada':
    case 'entregando':
      return 'IA preparando resposta humanizada...';
    case 'falhou':
      return 'Falha ao entregar resposta da IA';
    case 'cancelada':
      return 'Entrega da IA cancelada';
  }
}

export function formatarNotificacaoMensagem(
  r: Pick<MessageRecord, 'id' | 'timestamp' | 'senderName' | 'text' | 'type'> & {
    sender?: string;
    fromMe?: boolean;
  },
  slug: string,
  chatNome: string,
): NotificacaoItem | null {
  if (r.fromMe) return null;
  if (!r.timestamp || Number.isNaN(Date.parse(r.timestamp))) return null;
  const remetente = r.senderName?.trim() || chatNome;
  return {
    id: r.id || `msg:${slug}:${r.timestamp}`,
    tipo: 'mensagem',
    slug,
    chatNome,
    remetente,
    texto: previaMensagemNotificacao(r),
    timestamp: r.timestamp,
  };
}

export function formatarNotificacaoEntrega(
  ev: EventoEntregaCru,
  chatNomeFallback?: string,
): NotificacaoItem | null {
  const slug = ev.slug?.trim();
  const timestamp = (ev.ts ?? ev.timestamp ?? '').trim();
  if (!slug || !timestamp || Number.isNaN(Date.parse(timestamp))) return null;
  const estado = normalizarEstadoEntrega(ev.estado, ev.motivo);
  if (!estado) return null;
  const previa =
    ev.texto?.trim() ||
    ev.previa?.trim() ||
    (Array.isArray(ev.baloes) ? ev.baloes.map((b) => b.trim()).filter(Boolean).join(' ') : '');
  const chatNome = ev.chatNome?.trim() || chatNomeFallback || slug;
  const ticketId = ev.ticket?.trim() || ev.id?.trim() || `${slug}:${timestamp}:${estado}`;
  return {
    id: `entrega:${ticketId}`,
    tipo: 'sistema',
    slug,
    chatNome,
    remetente: 'IA',
    texto: textoNotificacaoEntrega(estado, previa),
    timestamp,
    estado,
  };
}

async function lerCaudaArquivo(caminho: string, maxBytes: number): Promise<string> {
  try {
    const st = await stat(caminho);
    if (st.size === 0) return '';
    const h = await open(caminho, 'r');
    try {
      const inicio = Math.max(0, st.size - maxBytes);
      const buf = Buffer.alloc(st.size - inicio);
      const { bytesRead } = await h.read(buf, 0, buf.length, inicio);
      const texto = buf.subarray(0, bytesRead).toString('utf8');
      return inicio > 0 ? texto.slice(texto.indexOf('\n') + 1) : texto;
    } finally {
      await h.close();
    }
  } catch {
    return '';
  }
}

async function lerMuted(dataDir: string): Promise<Record<string, boolean>> {
  if (dataDir === DATA_DIR) {
    const t = await readTriage();
    return t.muted;
  }
  try {
    const raw = JSON.parse(await readFile(join(dataDir, '.triage.json'), 'utf8')) as {
      muted?: Record<string, unknown>;
    };
    const out: Record<string, boolean> = {};
    if (raw?.muted && typeof raw.muted === 'object') {
      for (const [k, v] of Object.entries(raw.muted)) {
        if (typeof v === 'boolean') out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export interface OpcoesNotificacoes {
  dataDir?: string;
  agoraMs?: number;
  janelaMs?: number;
  limite?: number;
}

/**
 * Monta a lista inicial de notificações recentes (últimas 24h por padrão, até
 * 30 itens do mais novo para o mais antigo) combinando mensagens recebidas
 * (`fromMe: false`) e transições de `.entregas.jsonl` das conversas ativas
 * (não silenciadas em `triage.muted`).
 */
export async function listarNotificacoes(opts: OpcoesNotificacoes = {}): Promise<NotificacaoItem[]> {
  const dataDir = opts.dataDir ?? DATA_DIR;
  const agoraMs = opts.agoraMs ?? Date.now();
  const janelaMs = opts.janelaMs ?? JANELA_PADRAO_MS;
  const limite = opts.limite ?? LIMITE_PADRAO;
  const corteMs = agoraMs - janelaMs;

  const muted = await lerMuted(dataDir);
  const nomesPorSlug = new Map<string, string>();
  let slugsAtivos: string[] = [];

  if (dataDir === DATA_DIR) {
    const grupos = await conversasDaRequisicao();
    for (const g of grupos) {
      nomesPorSlug.set(g.slug, g.name);
      if (!muted[g.slug] && !g.muted) {
        try {
          safeDataPath(g.slug, 'messages.jsonl');
          slugsAtivos.push(g.slug);
        } catch {
          // ignora slug inválido
        }
      }
    }
  } else {
    try {
      const entries = await readdir(dataDir, { withFileTypes: true });
      slugsAtivos = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !muted[e.name])
        .map((e) => e.name);
    } catch {
      slugsAtivos = [];
    }
  }

  const porConversa = await Promise.all(
    slugsAtivos.map(async (slug): Promise<NotificacaoItem[]> => {
      const arq = join(dataDir, slug, 'messages.jsonl');
      const cauda = await lerCaudaArquivo(arq, CAUDA_MENSAGENS_BYTES);
      if (!cauda) return [];
      const registros: MessageRecord[] = [];
      for (const linha of cauda.split('\n')) {
        const l = linha.trim();
        if (!l) continue;
        try {
          registros.push(JSON.parse(l) as MessageRecord);
        } catch {
          // ignora linha truncada
        }
      }
      if (!registros.length) return [];
      const ultimo = registros.at(-1);
      const chatNome =
        nomesPorSlug.get(slug) ?? conversationName(slug, ultimo?.group ?? slug, registros);
      nomesPorSlug.set(slug, chatNome);

      const itensChat: NotificacaoItem[] = [];
      for (let i = registros.length - 1; i >= 0 && itensChat.length < 15; i--) {
        const r = registros[i];
        if (!r || r.fromMe) continue;
        const tsMs = Date.parse(r.timestamp);
        if (Number.isNaN(tsMs) || tsMs < corteMs) continue;
        const item = formatarNotificacaoMensagem(r, slug, chatNome);
        if (item) itensChat.push(item);
      }
      return itensChat;
    }),
  );

  const caudaEntregas = await lerCaudaArquivo(join(dataDir, '.entregas.jsonl'), CAUDA_ENTREGAS_BYTES);
  const entregasPorId = new Map<string, NotificacaoItem>();
  if (caudaEntregas) {
    for (const linha of caudaEntregas.split('\n')) {
      const l = linha.trim();
      if (!l) continue;
      let ev: EventoEntregaCru;
      try {
        ev = JSON.parse(l) as EventoEntregaCru;
      } catch {
        continue;
      }
      const slug = ev.slug?.trim();
      if (!slug || muted[slug]) continue;
      const item = formatarNotificacaoEntrega(ev, nomesPorSlug.get(slug) ?? slug);
      if (!item) continue;
      const tsMs = Date.parse(item.timestamp);
      if (Number.isNaN(tsMs) || tsMs < corteMs) continue;
      entregasPorId.set(item.id, item);
    }
  }

  return [...porConversa.flat(), ...entregasPorId.values()]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limite);
}
