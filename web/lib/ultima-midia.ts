import type { MessageView } from './data';

/**
 * mediaPath da ÚLTIMA mensagem entre os `tipos` dados (varre de trás pra frente).
 * Resolve o atrito de chamar ler_mensagens só pra extrair um path opaco antes de
 * transcrever/ver_imagem/etc. — o caso dominante é "a mídia que ACABOU de
 * chegar". null se não há mídia desses tipos. Função pura/testável.
 */
export function ultimaMidiaPath(msgs: MessageView[], tipos: readonly string[]): string | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.mediaPath && tipos.includes(m.type)) return m.mediaPath;
  }
  return null;
}
