import type { WAMessage } from 'baileys';
import type { Origem } from '../core/message.js';

/** Id gerado por cliente web (WhatsApp Web/Desktop e libs que o imitam): 3EB0 + 18 hex. */
const ID_CLIENTE_WEB = /^3EB0[0-9A-F]{18}$/i;

/**
 * Decide a origem pela mensagem crua. `coletor` NÃO sai daqui: quem sabe que o
 * envio foi deste processo é o gateway, que marca no eco do próprio envio.
 */
export function origemDe(
  wa: Pick<WAMessage, 'key' | 'message' | 'is1PBizBotMessage'>,
): Origem | undefined {
  const bot = wa.is1PBizBotMessage === true || Boolean(wa.message?.messageContextInfo?.botMetadata);
  if (bot) return 'ia_meta';
  if (!wa.key?.fromMe) return undefined;
  return ID_CLIENTE_WEB.test(wa.key.id ?? '') ? 'web' : 'celular';
}
