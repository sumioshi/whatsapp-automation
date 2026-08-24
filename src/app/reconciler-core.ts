/**
 * Núcleo puro do reconciliador: detecção de buraco de histórico e agendamento.
 * Sem I/O — o Reconciler (com socket/disco) consome estas funções.
 */

/** Recorte mínimo de um registro do messages.jsonl usado na detecção. */
export interface RegistroTail {
  id: string;
  timestampMs: number;
  fromMe: boolean;
  sender: string;
}

export type Buraco =
  | { tipo: 'sem_ancora' }
  | { tipo: 'com_ancora'; ancora: RegistroTail };

/** Diferenças menores que isto não são buraco (clock skew, entrega atrasada). */
const MARGEM_MS = 5 * 60_000;
/** Salto entre mensagens consecutivas do rabo que caracteriza buraco no meio. */
const SALTO_MS = 6 * 60 * 60_000;

/**
 * Detecta buraco de histórico num chat a partir do rabo do jsonl e da última
 * atividade conhecida (`conversationTimestamp` do WhatsApp, em segundos).
 *
 * - `com_ancora`: existe mensagem local DEPOIS do buraco → dá pra pedir
 *   histórico pra trás dela (fetchMessageHistory).
 * - `sem_ancora`: o buraco é no fim (o WhatsApp conhece atividade mais nova que
 *   tudo que temos) → só resolve quando chegar uma msg ao vivo pra ancorar.
 */
export function detectarBuraco(
  tail: RegistroTail[],
  lastActivityS: number | null,
  agoraMs: number,
): Buraco | null {
  // 1) Salto no meio do rabo → âncora = primeira mensagem depois do salto.
  for (let i = tail.length - 1; i > 0; i--) {
    const antes = tail[i - 1];
    const depois = tail[i];
    if (antes && depois && depois.timestampMs - antes.timestampMs > SALTO_MS) {
      return { tipo: 'com_ancora', ancora: depois };
    }
  }

  // 2) Atividade conhecida mais nova que a última local → buraco no fim.
  if (lastActivityS !== null) {
    const ultimaLocalMs = tail.at(-1)?.timestampMs ?? 0;
    if (lastActivityS * 1000 - ultimaLocalMs > MARGEM_MS) {
      return { tipo: 'sem_ancora' };
    }
  }

  void agoraMs; // reservado p/ heurísticas futuras (ex.: idade máxima do rabo)
  return null;
}

/** Próxima execução do loop: `intervaloMin` à frente, piso de 1 minuto. */
export function proximaExecucaoMs(agoraMs: number, intervaloMin: number): number {
  const min = Math.max(1, intervaloMin);
  return agoraMs + min * 60_000;
}
