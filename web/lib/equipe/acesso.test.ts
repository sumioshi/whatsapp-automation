import { describe, expect, it } from 'vitest';
import type { Contacts } from '../contacts';
import { chatsEfetivos, ErroHttp, exigirChat } from './acesso';

function contatos(phones: Array<[string, string]>): Contacts {
  return {
    names: new Map(),
    ownIds: new Set(),
    teamIds: new Set(),
    phones: new Map(phones),
    lids: new Set(phones.map(([lid]) => lid)),
    hasSidecar: true,
  };
}

describe('chatsEfetivos', () => {
  const c = contatos([['98200000000001', '5511999999999']]);
  const existentes = new Set(['grupo-a', 'dm-5511999999999', 'dm-98200000000001', 'dm-5511888888888']);

  it('DM liberada pelo telefone abre o irmão por LID, e vice-versa', () => {
    expect(chatsEfetivos(['dm-5511999999999'], c, existentes)).toEqual(new Set(['dm-5511999999999', 'dm-98200000000001']));
    expect(chatsEfetivos(['dm-98200000000001'], c, existentes)).toEqual(new Set(['dm-5511999999999', 'dm-98200000000001']));
  });
  it('não abre DM de outra pessoa nem grupo não liberado', () => {
    const s = chatsEfetivos(['dm-5511999999999'], c, existentes);
    expect(s.has('dm-5511888888888')).toBe(false);
    expect(s.has('grupo-a')).toBe(false);
  });
  it('grupo é ele mesmo', () => {
    expect(chatsEfetivos(['grupo-a'], c, existentes)).toEqual(new Set(['grupo-a']));
  });
  it('irmão que não existe no coletor não entra; o slug liberado sempre fica', () => {
    expect(chatsEfetivos(['dm-5511999999999'], c, new Set())).toEqual(new Set(['dm-5511999999999']));
  });
});

describe('exigirChat', () => {
  it('chat fora da lista é 404', () => {
    const a = { usuario: {} as never, chats: new Set(['grupo-a']) };
    expect(() => exigirChat(a, 'grupo-a')).not.toThrow();
    try {
      exigirChat(a, 'grupo-b');
      throw new Error('devia ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(ErroHttp);
      expect((e as ErroHttp).status).toBe(404);
    }
  });
});
