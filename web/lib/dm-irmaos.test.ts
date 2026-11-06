import { describe, expect, it } from 'vitest';
import type { Contacts } from './contacts';
import type { MessageView } from './data';
import { fundirMensagens, slugsIrmaosDeDm } from './dm-irmaos';

const c: Contacts = {
  names: new Map(),
  ownIds: new Set(),
  teamIds: new Set(),
  // o LID 400000… é o mesmo contato do telefone 5511987650001
  phones: new Map([
    ['40000000000001', '5511987650001'],
    ['5511987650001', '5511987650001'],
  ]),
  lids: new Set(['40000000000001', '99999999999999']),
  hasSidecar: true,
};
const existentes = new Set(['dm-5511987650001', 'dm-40000000000001', 'dm-111', 'grupo-x']);

describe('slugsIrmaosDeDm', () => {
  it('slug de LID traz o slug do telefone junto (telefone primeiro)', () => {
    expect(slugsIrmaosDeDm('dm-40000000000001', c, existentes)).toEqual([
      'dm-5511987650001',
      'dm-40000000000001',
    ]);
  });

  it('slug de telefone traz o slug de LID junto', () => {
    expect(slugsIrmaosDeDm('dm-5511987650001', c, existentes)).toEqual([
      'dm-5511987650001',
      'dm-40000000000001',
    ]);
  });

  it('irmão que não existe no coletor não entra', () => {
    const so = new Set(['dm-40000000000001']);
    expect(slugsIrmaosDeDm('dm-40000000000001', c, so)).toEqual(['dm-40000000000001']);
  });

  it('LID sem telefone conhecido fica sozinho', () => {
    expect(slugsIrmaosDeDm('dm-99999999999999', c, existentes)).toEqual(['dm-99999999999999']);
  });

  it('grupo não é DM: devolve o próprio slug', () => {
    expect(slugsIrmaosDeDm('grupo-x', c, existentes)).toEqual(['grupo-x']);
  });
});

describe('fundirMensagens', () => {
  const m = (id: string, ts: string) => ({ id, timestamp: ts }) as MessageView;

  it('junta as listas por id (sem duplicar) e ordena por tempo', () => {
    const out = fundirMensagens([
      [m('b', '2026-09-09T10:00:00Z'), m('c', '2026-09-10T10:00:00Z')],
      [m('a', '2026-09-08T10:00:00Z'), m('b', '2026-09-09T10:00:00Z')],
    ]);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});
