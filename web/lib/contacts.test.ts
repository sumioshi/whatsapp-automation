import { describe, expect, it } from 'vitest';
import { type Contacts, sendableDmJid } from './contacts';

function contacts(p: Partial<Contacts> = {}): Contacts {
  return {
    names: new Map(),
    ownIds: new Set(),
    teamIds: new Set(),
    phones: new Map(),
    lids: new Set(),
    hasSidecar: true,
    ...p,
  };
}

describe('sendableDmJid', () => {
  it('LID com telefone no sidecar → telefone real (o bug do LID-sem-telefone)', () => {
    // Sidecar (exemplo): 100000000000001 (LID) → 551199999999 (telefone).
    const c = contacts({
      phones: new Map([['100000000000001', '551199999999']]),
      lids: new Set(['100000000000001']),
    });
    // Antes: virava 100000000000001@s.whatsapp.net (destino inexistente, msg fantasma).
    expect(sendableDmJid(c, '100000000000001')).toBe('551199999999@s.whatsapp.net');
  });

  it('telefone puro (sem mapa) → @s.whatsapp.net', () => {
    expect(sendableDmJid(contacts(), '551199999999')).toBe('551199999999@s.whatsapp.net');
  });

  it('LID conhecido SEM telefone → @lid (destino válido, não @s.whatsapp.net)', () => {
    const c = contacts({ lids: new Set(['999888777666555']) });
    expect(sendableDmJid(c, '999888777666555')).toBe('999888777666555@lid');
  });

  it('user-part curto/inválido → null (não envia às cegas)', () => {
    expect(sendableDmJid(contacts(), '123')).toBeNull();
    expect(sendableDmJid(contacts(), '')).toBeNull();
  });
});
