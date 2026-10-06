import { describe, expect, it } from 'vitest';
import { candidatosDoInbox } from './inbox';

const grupos = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }];
const muted = { b: true };

describe('candidatosDoInbox', () => {
  it('dono: todos menos os silenciados (comportamento de sempre)', () => {
    expect(candidatosDoInbox(grupos, muted).map((g) => g.slug)).toEqual(['a', 'c']);
  });
  it('atendente: só os chats dele, e o silêncio do dono não esconde nada', () => {
    const r = candidatosDoInbox(grupos, muted, { slugs: new Set(['b', 'c']), ignorarSilenciados: true });
    expect(r.map((g) => g.slug)).toEqual(['b', 'c']);
  });
  it('filtro de slugs sem ignorar silenciados', () => {
    expect(candidatosDoInbox(grupos, muted, { slugs: new Set(['a', 'b']) }).map((g) => g.slug)).toEqual(['a']);
  });
});
