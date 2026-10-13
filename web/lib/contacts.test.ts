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

  it('índice contaminado com "desconhecido" não vaza pra UI', () => {
    const sujo = {
      ...(c as object),
      names: new Map([['554590000002', 'desconhecido']]),
    } as never;
    expect(displayNameOf(sujo, 'desconhecido', '554590000002')).toBe('+55 45 9000-0002');
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

// ── Meu time: LID e telefone da mesma pessoa são uma pessoa só ───────────────
import { pessoaDe, pessoasDoTime, timeAlternado } from './contacts';

describe('pessoas do time', () => {
  // Ana fala pelos dois ids (LID e telefone); Bia só pelo telefone; o sidecar liga o LID da Ana ao telefone dela.
  const base = () =>
    contacts({
      names: new Map([
        ['100000000000001', 'Ana Time'],
        ['5511900000001', 'Ana Time'],
        ['5511900000002', 'Bia'],
        ['5511900000003', 'Bia'],
        ['5511900000009', 'Eu'],
      ]),
      ownIds: new Set(['5511900000009']),
      phones: new Map([
        ['100000000000001', '5511900000001'],
        ['5511900000001', '5511900000001'],
      ]),
      lids: new Set(['100000000000001']),
    });

  it('LID ligado a um telefone e o próprio telefone dão a mesma pessoa', () => {
    const c = base();
    expect(pessoaDe(c, '100000000000001')).toBe('5511900000001');
    expect(pessoaDe(c, '5511900000001')).toBe('5511900000001');
    expect(pessoaDe(c, '5511900000002')).toBe('5511900000002');
  });

  it('lista uma linha por pessoa, sem você, e homônimos com telefones diferentes seguem separados', () => {
    const linhas = pessoasDoTime(base());
    expect(linhas.map((l) => [l.id, l.name])).toEqual([
      ['5511900000001', 'Ana Time'],
      ['5511900000002', 'Bia'],
      ['5511900000003', 'Bia'],
    ]);
  });

  it('a linha leva todos os ids da pessoa, para a conversa reconhecer o time por qualquer um', () => {
    const ana = pessoasDoTime(base()).find((l) => l.id === '5511900000001');
    expect(ana?.ids.sort()).toEqual(['100000000000001', '5511900000001']);
  });

  it('a pessoa aparece no time quando qualquer um dos ids dela está marcado', () => {
    const c = { ...base(), teamIds: new Set(['100000000000001']) };
    expect(pessoasDoTime(c).find((l) => l.id === '5511900000001')?.role).toBe('team');
  });

  it('marcar pela linha grava o LID e o telefone', () => {
    expect(timeAlternado(base(), [], '5511900000001', true).sort()).toEqual(['100000000000001', '5511900000001']);
  });

  it('desmarcar tira os dois ids, mesmo quando só um estava gravado', () => {
    expect(timeAlternado(base(), ['100000000000001', '5511900000002'], '5511900000001', false)).toEqual(['5511900000002']);
  });

  it('marcar outra pessoa completa quem já estava marcado só por um id', () => {
    expect(timeAlternado(base(), ['100000000000001'], '5511900000002', true).sort()).toEqual([
      '100000000000001',
      '5511900000001',
      '5511900000002',
    ]);
  });
});
