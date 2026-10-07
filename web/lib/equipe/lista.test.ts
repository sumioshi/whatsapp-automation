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

  it('DM partida em telefone × LID vira um item só, no slug do telefone', () => {
    const tel = 'dm-5511999999999';
    const lid = 'dm-98200000000001';
    const canonicoDe = (slug: string) => (slug === lid ? tel : slug);
    const lista = listaDoAtendente(
      [
        g(lid, '2026-10-01T14:00:00.000Z', { unread: 2, lastPreview: 'do lid', name: 'Fulano', messageCount: 4 }),
        g('grupo-a', '2026-10-01T13:00:00.000Z', { unread: 1 }),
        g(tel, '2026-10-01T10:00:00.000Z', { unread: 3, messageCount: 7, lastPreview: 'do telefone', name: 'Fulano', avatarPath: `${tel}/avatar.jpg` }),
      ],
      new Set([tel, lid, 'grupo-a']),
      canonicoDe,
    );
    expect(lista.map((x) => x.slug)).toEqual([tel, 'grupo-a']);
    expect(lista[0]).toMatchObject({
      slug: tel,
      name: 'Fulano',
      unread: 5,
      lastTimestamp: '2026-10-01T14:00:00.000Z',
      lastPreview: 'do lid',
      avatarPath: `${tel}/avatar.jpg`,
      messageCount: 7,
    });
  });
  it('irmão sem o do telefone na lista: o item leva o slug canônico mesmo assim', () => {
    const lista = listaDoAtendente(
      [g('dm-98200000000001', '2026-10-01T14:00:00.000Z', { unread: 1 })],
      new Set(['dm-98200000000001']),
      () => 'dm-5511999999999',
    );
    expect(lista.map((x) => [x.slug, x.unread])).toEqual([['dm-5511999999999', 1]]);
  });
});
