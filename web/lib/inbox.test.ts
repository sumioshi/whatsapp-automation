import { describe, expect, it } from 'vitest';
import type { Contacts } from './contacts';
import { agruparConversas, avaliarConversa, candidatosDoInbox } from './inbox';

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

describe('conversa partida (DM telefone × LID) no aguardando resposta', () => {
  const tel = 'dm-5511999999999';
  const lid = 'dm-98200000000001';
  const contatos = { names: new Map(), ownIds: new Set(['5511000000000']), teamIds: new Set(), phones: new Map(), lids: new Set(), hasSidecar: true } as Contacts;
  const msg = (id: string, timestamp: string, fromMe: boolean) => ({
    id, timestamp, fromMe, type: 'text' as const, text: fromMe ? 'respondido' : 'oi',
    sender: fromMe ? '5511000000000@s.whatsapp.net' : '5511999999999@s.whatsapp.net', senderName: fromMe ? 'Você' : 'Fulano',
  });

  it('agrupa os irmãos sob o slug canônico e mantém os demais', () => {
    const canonicoDe = (s: string) => (s === lid ? tel : s);
    const r = agruparConversas([{ slug: lid }, { slug: 'grupo-a' }, { slug: tel }], canonicoDe);
    expect(r).toEqual([
      { slug: tel, membros: [{ slug: lid }, { slug: tel }] },
      { slug: 'grupo-a', membros: [{ slug: 'grupo-a' }] },
    ]);
    expect(agruparConversas([{ slug: 'a' }, { slug: 'b' }]).map((x) => x.slug)).toEqual(['a', 'b']);
  });
  it('resposta gravada no outro irmão conta: ninguém aguardando', () => {
    const doTelefone = [msg('1', '2026-10-01T10:00:00.000Z', false)];
    const doLid = [msg('2', '2026-10-01T10:05:00.000Z', true)];
    expect(avaliarConversa([doTelefone], contatos)?.reason).toBe('client-waiting');
    expect(avaliarConversa([doTelefone, doLid], contatos)).toBeNull();
  });
  it('a espera começa na 1ª mensagem sem resposta somando os dois lados, sem duplicar o mesmo id', () => {
    const doTelefone = [msg('1', '2026-10-01T10:00:00.000Z', true), msg('3', '2026-10-01T10:10:00.000Z', false)];
    const doLid = [msg('2', '2026-10-01T10:05:00.000Z', false), msg('3', '2026-10-01T10:10:00.000Z', false)];
    const v = avaliarConversa([doTelefone, doLid], contatos);
    expect(v).toMatchObject({ reason: 'client-waiting', waitingSince: '2026-10-01T10:05:00.000Z', timestamp: '2026-10-01T10:10:00.000Z' });
  });
});
