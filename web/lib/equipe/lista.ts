import type { GroupSummary } from '../data';

/**
 * Lista de chats do atendente: só os liberados, sem o estado de organização do
 * dono (etiquetas, silenciado, fixado, arquivado), em ordem de recência. A DM
 * partida em telefone × LID vira um item só, no slug de `canonicoDe`: não lido
 * somado, prévia e horário do lado mais recente.
 */
export function listaDoAtendente(
  grupos: GroupSummary[],
  chats: ReadonlySet<string>,
  canonicoDe: (slug: string) => string = (s) => s,
): GroupSummary[] {
  const porConversa = new Map<string, GroupSummary[]>();
  for (const g of grupos) {
    if (!chats.has(g.slug)) continue;
    const k = canonicoDe(g.slug);
    porConversa.set(k, [...(porConversa.get(k) ?? []), g]);
  }
  const out: GroupSummary[] = [];
  for (const [slug, membros] of porConversa) {
    const recente = membros.reduce((a, b) => ((b.lastTimestamp ?? '') > (a.lastTimestamp ?? '') ? b : a));
    const canonico = membros.find((m) => m.slug === slug);
    const { etiquetas: _e, muted: _m, pinned: _p, pinnedAt: _pa, archived: _a, ...resto } = recente;
    out.push({
      ...resto,
      slug,
      name: canonico?.name ?? recente.name,
      avatarPath: canonico?.avatarPath ?? membros.find((m) => m.avatarPath)?.avatarPath ?? null,
      unread: membros.reduce((n, m) => n + m.unread, 0),
      // Máximo, não soma: o mesmo id pode estar nos dois irmãos e só dá pra
      // de-duplicar lendo os registros; o maior é o piso sem contar em dobro.
      messageCount: Math.max(...membros.map((m) => m.messageCount)),
    });
  }
  return out.sort((a, b) => (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? ''));
}
