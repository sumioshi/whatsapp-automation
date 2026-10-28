import { describe, expect, it } from 'vitest';
import type { Contacts } from './contacts';
import type { GroupSummary } from './data';
import type { InboxItem } from './inbox';
import type { LinksMap } from './links';
import { contarDoCliente, montarCaixa, projetoDe } from './caixa-de-entrada';

const links: LinksMap = {
  'projeto-113': { repoPath: '/Users/x/SaaS-clientes/projeto-177', cliente: 'Projeto 171', tipo: 'grupo', notas: '', github: 'org/projeto-177' },
  'dm-5511': { repoPath: '/Users/x/SaaS-clientes/same', cliente: 'Same', tipo: 'dm', notas: '' },
};

const grupo = (slug: string, lastTimestamp: string): GroupSummary => ({
  slug,
  name: `Nome ${slug}`,
  messageCount: 10,
  lastTimestamp,
  avatarPath: null,
  lastPreview: `Fulano: oi de ${slug}`,
  unread: 0,
});

const espera = (slug: string, waitingMs: number): InboxItem => ({
  slug,
  groupName: `Nome ${slug}`,
  reason: 'client-waiting',
  preview: 'cadê o build?',
  who: 'Tânia',
  timestamp: '2026-10-28T12:00:00.000Z',
  waitingSince: '2026-10-28T09:00:00.000Z',
  waitingMs,
  band: 'warm',
  waitingLabel: 'há 3h',
});

describe('projetoDe', () => {
  it('traz cliente, pasta do repo e github do links.json', () => {
    expect(projetoDe(links, 'projeto-113')).toEqual({ cliente: 'Projeto 171', repo: 'projeto-177', github: 'org/projeto-177' });
  });
  it('github ausente vira null; chat sem link não tem projeto', () => {
    expect(projetoDe(links, 'dm-5511')?.github).toBeNull();
    expect(projetoDe(links, 'outro')).toBeNull();
  });
});

describe('montarCaixa', () => {
  const grupos = [grupo('projeto-113', '2026-10-28T12:00:00.000Z'), grupo('dm-5511', '2026-10-28T14:00:00.000Z'), grupo('calado', '2026-10-28T15:00:00.000Z')];

  it('pendentes: só quem espera, na ordem da fila, com projeto e espera traduzidos', () => {
    const itens = montarCaixa([espera('projeto-113', 3 * 3600_000)], grupos, links, null);
    expect(itens).toEqual([
      {
        grupo: 'projeto-113',
        nome: 'Nome projeto-113',
        projeto: { cliente: 'Projeto 171', repo: 'projeto-177', github: 'org/projeto-177' },
        esperando: { motivo: 'cliente_esperando', de: 'Tânia', previa: 'cadê o build?', desde: '2026-10-28T09:00:00.000Z', ha: 'há 3h', faixa: 'warm' },
        do_cliente_desde: null,
        ultima: { previa: 'Fulano: oi de projeto-113', quando: '2026-10-28T12:00:00.000Z' },
      },
    ]);
  });

  it('todos: pendentes primeiro, depois quem recebeu de cliente pela última atividade; sem msg de cliente fica fora', () => {
    const mov = new Map([
      ['projeto-113', 2],
      ['dm-5511', 1],
      ['calado', 0],
    ]);
    const itens = montarCaixa([espera('projeto-113', 1)], grupos, links, mov);
    expect(itens.map((i) => [i.grupo, i.esperando ? 'espera' : 'ok', i.do_cliente_desde])).toEqual([
      ['projeto-113', 'espera', 2],
      ['dm-5511', 'ok', 1],
    ]);
  });
});

describe('contarDoCliente', () => {
  const contatos = {
    names: new Map(),
    ownIds: new Set(['5511000000000']),
    teamIds: new Set(['5511777777777']),
    phones: new Map(),
    lids: new Set(),
    hasSidecar: true,
  } as Contacts;
  const m = (timestamp: string, sender: string, fromMe = false) => ({ timestamp, sender: `${sender}@s.whatsapp.net`, fromMe });

  it('conta só cliente, desde o instante pedido', () => {
    const msgs = [
      m('2026-10-27T10:00:00.000Z', '5511999999999'),
      m('2026-10-28T10:00:00.000Z', '5511999999999'),
      m('2026-10-28T11:00:00.000Z', '5511777777777'),
      m('2026-10-28T12:00:00.000Z', '5511000000000', true),
      m('2026-10-28T13:00:00.000Z', '5511888888888'),
    ];
    expect(contarDoCliente(msgs, '2026-10-28T00:00:00.000Z', contatos)).toBe(2);
  });
});
