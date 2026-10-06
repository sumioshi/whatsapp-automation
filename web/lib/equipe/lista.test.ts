import { describe, expect, it } from 'vitest';
import type { GroupSummary } from '../data';
import { listaDoAtendente } from './lista';

const g = (slug: string, lastTimestamp: string, extra: Partial<GroupSummary> = {}): GroupSummary => ({
  slug,
  name: slug,
  messageCount: 1,
  lastTimestamp,
  avatarPath: null,
  lastPreview: null,
  unread: 0,
  ...extra,
});

describe('listaDoAtendente', () => {
  const grupos = [
    g('fixado', '2026-10-01T09:00:00.000Z', { pinned: true, pinnedAt: 10, etiquetas: ['contrato'], muted: true }),
    g('recente', '2026-10-01T12:00:00.000Z', { lastActivity: 5 }),
    g('arquivado', '2026-10-01T15:00:00.000Z', { archived: true }),
    g('fora', '2026-10-01T18:00:00.000Z'),
  ];

  it('só os chats liberados, sem etiqueta/silêncio/fixado/arquivado do dono', () => {
    const lista = listaDoAtendente(grupos, new Set(['fixado', 'recente', 'arquivado']));
    expect(lista.map((x) => x.slug)).toEqual(['arquivado', 'recente', 'fixado']);
    for (const x of lista) {
      for (const k of ['etiquetas', 'muted', 'pinned', 'pinnedAt', 'archived']) expect(x).not.toHaveProperty(k);
    }
    expect(lista[1]).toMatchObject({ slug: 'recente', lastActivity: 5, unread: 0 });
  });

  it('não altera os objetos de origem', () => {
    listaDoAtendente(grupos, new Set(['fixado']));
    expect(grupos[0]?.pinned).toBe(true);
  });
});
