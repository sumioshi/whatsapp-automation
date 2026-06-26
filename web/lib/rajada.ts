/** Janela (ms) dentro da qual mensagens consecutivas do MESMO remetente contam
 * como uma rajada (a pessoa mandando várias coisas seguidas sobre o mesmo
 * assunto: vídeo + "olha isso" + áudio). 90s cobre o tempo de gravar/anexar. */
const RAJADA_MS = 90_000;

interface ComRemetenteETempo {
  de: string;
  timestamp: string;
}

/**
 * Marca rajadas: sequências de mensagens consecutivas do MESMO remetente com
 * menos de RAJADA_MS entre uma e a próxima. Cada rajada com 2+ mensagens recebe
 * um `rajada` (id sequencial 1,2,3...); mensagens isoladas ficam sem o campo.
 * Sem isso, "vídeo + texto + áudio" numa tacada só viram itens soltos e a IA
 * pode misturar assuntos ou separar o que era junto.
 *
 * PURO: muta cada item adicionando `rajada?`, e devolve a mesma lista. Espera a
 * lista em ordem cronológica (como ler_mensagens entrega).
 */
export function marcarRajadas<T extends ComRemetenteETempo>(msgs: T[]): (T & { rajada?: number })[] {
  let rajadaId = 0;
  let i = 0;
  while (i < msgs.length) {
    // Estende a janela enquanto for o mesmo remetente e o gap for curto.
    let j = i + 1;
    while (
      j < msgs.length &&
      msgs[j].de === msgs[i].de &&
      new Date(msgs[j].timestamp).getTime() - new Date(msgs[j - 1].timestamp).getTime() < RAJADA_MS
    ) {
      j++;
    }
    if (j - i >= 2) {
      rajadaId++;
      for (let k = i; k < j; k++) (msgs[k] as T & { rajada?: number }).rajada = rajadaId;
    }
    i = j;
  }
  return msgs as (T & { rajada?: number })[];
}
