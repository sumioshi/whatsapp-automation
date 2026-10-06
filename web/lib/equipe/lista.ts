import type { GroupSummary } from '../data';

/**
 * Lista de chats do atendente: só os liberados, sem o estado de organização do
 * dono (etiquetas, silenciado, fixado, arquivado), em ordem de recência.
 */
export function listaDoAtendente(grupos: GroupSummary[], chats: ReadonlySet<string>): GroupSummary[] {
  return grupos
    .filter((g) => chats.has(g.slug))
    .map(({ etiquetas: _e, muted: _m, pinned: _p, pinnedAt: _pa, archived: _a, ...resto }) => resto)
    .sort((a, b) => (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? ''));
}
