import { bloqueiosDe } from '../estilo/revisar';

const JANELA_MS = 30 * 60_000;

/** Textos que a conta mandou no chat nos últimos 30 min (base da trava de repetição). */
export function recentesDaConta(
  records: { fromMe?: boolean; timestamp: string; text: string }[],
  agora: number,
): string[] {
  return records
    .filter((r) => r.fromMe && r.text && agora - Date.parse(r.timestamp) <= JANELA_MS)
    .map((r) => r.text);
}

/**
 * Registros de todos os slugs da mesma conversa (DM partida em telefone × LID):
 * o balão mandado por um dos lados também conta como repetição no outro.
 */
export async function registrosDaConversa<T>(slugs: string[], ler: (slug: string) => Promise<T[]>): Promise<T[]> {
  return (await Promise.all(slugs.map(ler))).flat();
}

/**
 * O atendente escreve como o operador: valem os bloqueios da revisão, não o
 * score (calibrado pra IA). Devolve a mensagem pro composer, ou null se passa.
 */
export function motivoDeRecusa(texto: string, recentes: string[]): string | null {
  const b = bloqueiosDe([texto], recentes);
  if (!b.length) return null;
  return b.map((h) => `${h.motivo} — troque por: ${h.sugestao}`).join(' · ');
}
