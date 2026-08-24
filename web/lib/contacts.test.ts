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

// ── displayNameOf: nunca vazar JID/“desconhecido” pra UI ─────────────────────
import { displayNameOf, formatPhoneBR } from './contacts';

describe('displayNameOf', () => {
  const c = {
    names: new Map([
      ['100000000000003', 'Daniel Souza'],
      ['5544900000001', 'Fulano 44'],
    ]),
    ownIds: new Set<string>(),
    teamIds: new Set<string>(),
    phones: new Map([['10000000000006', '5511987654321']]),
    lids: new Set(['10000000000006']),
    hasSidecar: true,
  } as never;

  it('nome legível existente passa direto', () => {
    expect(displayNameOf(c, 'Pedro Lima', 'qualquer')).toBe('Pedro Lima');
  });

  it('senderName numérico resolve pelo índice de contatos', () => {
    expect(displayNameOf(c, '100000000000003', '100000000000003')).toBe('Daniel Souza');
  });

  it('"desconhecido" com id conhecido resolve pelo índice', () => {
    expect(displayNameOf(c, 'desconhecido', '5544900000001')).toBe('Fulano 44');
  });

  it('sem nome mas com telefone no sidecar → telefone formatado', () => {
    expect(displayNameOf(c, 'desconhecido', '10000000000006')).toBe('+55 11 98765-4321');
  });

  it('sem nada conhecido → número formatado se parecer telefone, senão "Contato"', () => {
    expect(displayNameOf(c, '5531999887766', '5531999887766')).toBe('+55 31 99988-7766');
    expect(displayNameOf(c, 'desconhecido', '999')).toBe('Contato');
  });
});

describe('formatPhoneBR', () => {
  it('formata número BR de 13 dígitos', () => {
    expect(formatPhoneBR('5544900000001')).toBe('+55 44 90000-0001');
  });
  it('número não-BR ou curto sai com + na frente', () => {
    expect(formatPhoneBR('14155552671')).toBe('+14155552671');
  });
});
