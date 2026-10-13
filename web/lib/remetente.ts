/** O que basta de uma linha do messages.jsonl para saber quem escreveu. */
type LinhaComRemetente = { sender?: string; fromMe?: boolean; groupJid?: string };

/**
 * Remetente de uma linha do messages.jsonl. Mensagem recebida em DM pode estar
 * gravada com `sender` vazio: quem escreveu é o outro lado da conversa, o
 * `groupJid`. Em grupo não há como saber, e o valor gravado volta como está.
 */
export function remetenteDaLinha(m: LinhaComRemetente): string | undefined {
  if (m.sender || m.fromMe) return m.sender;
  const jid = m.groupJid ?? '';
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid') ? jid : m.sender;
}
