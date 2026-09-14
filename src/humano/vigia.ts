/**
 * Reage ao que chega no chat enquanto um ticket está vivo: cliente falou
 * (adia; no meio da entrega, interrompe), operador respondeu na mão
 * (interrompe), cliente digitando (segura). Puro sobre o EstadoFila; quem
 * aborta o AbortController e persiste é o worker.
 */
import type { InboundMessage, InboundPresence } from '../core/message.js';
import {
  clienteDigitando,
  clienteParou,
  type EstadoFila,
  interromper,
  registrarMensagemNova,
  type Ticket,
  ticketVivo,
} from './fila-core.js';

export type MsgVigia = Pick<InboundMessage, 'groupJid' | 'fromMe' | 'sender' | 'origem'>;
export type PresencaVigia = Pick<InboundPresence, 'chatJid' | 'participant' | 'state'>;

export const userPart = (jid: string): string => (jid.split('@')[0] ?? '').split(':')[0] ?? '';

export function aoReceberMensagem(
  e: EstadoFila,
  msg: MsgVigia,
  equipe: Set<string>,
  agora: number,
  rng: () => number,
): { ticket: Ticket; acao: 'adiou' | 'interrompeu' } | null {
  const jid = msg.groupJid;
  const vivo = ticketVivo(e, jid);
  if (!vivo) return null;
  if (msg.fromMe) {
    if (msg.origem !== 'celular' && msg.origem !== 'web') return null;
    const t = interromper(e, { jid }, 'operador_respondeu', agora);
    return t ? { ticket: t, acao: 'interrompeu' } : null;
  }
  if (equipe.has(userPart(msg.sender))) return null;
  const antes = vivo.estado;
  const t = registrarMensagemNova(e, jid, agora, rng);
  if (!t) return null;
  return { ticket: t, acao: antes === 'entregando' ? 'interrompeu' : 'adiou' };
}

export function aoPresenca(
  e: EstadoFila,
  p: PresencaVigia,
  agora: number,
): 'digitando' | 'parou' | null {
  if (!ticketVivo(e, p.chatJid)) return null;
  if (p.state === 'composing' || p.state === 'recording') {
    clienteDigitando(e, p.chatJid, agora);
    return 'digitando';
  }
  clienteParou(e, p.chatJid);
  return 'parou';
}
