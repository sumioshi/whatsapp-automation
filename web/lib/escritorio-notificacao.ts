/**
 * Notificação de mensagem nova no escritório 2D: traduz um evento do stream
 * SSE (`/api/events`) no projeto que deve reagir (NPC, balão, som) e limita a
 * cadência dos sons pra uma rajada de mensagens não virar uma sirene.
 * Módulo puro, sem DOM: o estado de tempo entra por parâmetro.
 */

export interface EventoMensagemSse {
  slug?: string;
  fromMe?: boolean;
  senderName?: string | null;
  sender?: string | null;
  text?: string | null;
  type?: string | null;
  origem?: string | null;
}

/** Recorte mínimo do cliente que o escritório precisa pra resolver DM → projeto. */
export interface ClienteNotificavel {
  slug: string;
  contatosVinculados?: Array<{ dmSlug?: string | null; dmSlugs?: string[]; nome?: string }>;
}

export interface MensagemInterpretada {
  /** Slug do projeto (NPC) que recebe a notificação. */
  slugProjeto: string;
  /** Slug do chat onde a mensagem chegou (o próprio projeto ou a DM vinculada). */
  origemSlug: string;
  /** Quem escreveu, como a prévia deve mostrar. */
  autor: string;
  /** Texto curto ou rótulo por tipo de mídia. */
  previa: string;
  tipo: string;
}

export const PREVIA_MAX_CHARS = 90;

const ROTULO_POR_TIPO: Record<string, string> = {
  audio: '[áudio]',
  ptt: '[áudio]',
  image: '[imagem]',
  video: '[vídeo]',
  gif: '[vídeo]',
  document: '[documento]',
  sticker: '[figurinha]',
};

/** Texto da mensagem encurtado, ou o rótulo do tipo quando não há texto. */
export function previaDaMensagem(evento: EventoMensagemSse): string {
  const texto = (evento.text ?? '').replace(/\s+/g, ' ').trim();
  if (texto) {
    return texto.length > PREVIA_MAX_CHARS ? `${texto.slice(0, PREVIA_MAX_CHARS).trimEnd()}…` : texto;
  }
  const tipo = (evento.type ?? '').toLowerCase();
  return ROTULO_POR_TIPO[tipo] ?? '[mensagem]';
}

/**
 * Resolve em qual projeto a mensagem cai. Mensagem da própria conta (eco do
 * coletor, resposta manual do operador) não notifica. Slug que é um projeto
 * visível é ele mesmo; slug que é a DM vinculada de um contato notifica o
 * projeto do contato (o primeiro que o vincula); fora disso, nada.
 */
export function interpretarEventoMensagem(
  payload: unknown,
  clientes: ClienteNotificavel[],
): MensagemInterpretada | null {
  if (!payload || typeof payload !== 'object') return null;
  const evento = payload as EventoMensagemSse;
  if (evento.fromMe) return null;
  const slug = typeof evento.slug === 'string' ? evento.slug.trim() : '';
  if (!slug) return null;

  let slugProjeto: string | null = null;
  let autorContato: string | undefined;
  for (const c of clientes) {
    if (c.slug === slug) {
      slugProjeto = c.slug;
      break;
    }
    const contato = (c.contatosVinculados ?? []).find(
      (ct) => ct.dmSlug === slug || (ct.dmSlugs ?? []).includes(slug),
    );
    if (contato) {
      slugProjeto = c.slug;
      autorContato = contato.nome;
      break;
    }
  }
  if (!slugProjeto) return null;

  const autorBruto = (evento.senderName ?? '').trim() || autorContato || (evento.sender ?? '').split('@')[0] || 'Cliente';
  const autor = slugProjeto === slug ? autorBruto : `${autorBruto} (DM)`;

  return {
    slugProjeto,
    origemSlug: slug,
    autor,
    previa: previaDaMensagem(evento),
    tipo: (evento.type ?? 'text').toLowerCase(),
  };
}

export const FREIO_POR_SLUG_MS = 3_000;
export const FREIO_GLOBAL_MS = 1_000;

/**
 * Freio de som: no máximo um por slug a cada 3 s e um global a cada 1 s.
 * Rajada de mensagens do mesmo cliente = um som; dois clientes no mesmo
 * segundo = um som.
 */
export class FreioPorChat {
  private ultimoPorSlug = new Map<string, number>();
  private ultimoGlobal = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly porSlugMs = FREIO_POR_SLUG_MS,
    private readonly globalMs = FREIO_GLOBAL_MS,
  ) {}

  /** `true` quando o som pode tocar agora; registra o instante quando libera. */
  permitir(slug: string, agora: number = Date.now()): boolean {
    if (agora - this.ultimoGlobal < this.globalMs) return false;
    const ultimo = this.ultimoPorSlug.get(slug);
    if (ultimo !== undefined && agora - ultimo < this.porSlugMs) return false;
    this.ultimoPorSlug.set(slug, agora);
    this.ultimoGlobal = agora;
    return true;
  }
}
