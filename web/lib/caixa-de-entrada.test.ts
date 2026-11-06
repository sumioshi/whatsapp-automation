import { describe, expect, it } from 'vitest';
import type { Contacts } from './contacts';
import type { GroupSummary } from './data';
import type { InboxItem } from './inbox';
import type { LinksMap } from './links';
import { contarDoCliente, encerramento, montarCaixa, projetoDe, separarEspera } from './caixa-de-entrada';

const links: LinksMap = {
  'acme-app': { repoPath: '/Users/x/SaaS-clientes/acme', cliente: 'Acme', tipo: 'grupo', notas: '', github: 'org/acme' },
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
    expect(projetoDe(links, 'acme-app')).toEqual({ cliente: 'Acme', repo: 'acme', github: 'org/acme' });
  });
  it('github ausente vira null; chat sem link não tem projeto', () => {
    expect(projetoDe(links, 'dm-5511')?.github).toBeNull();
    expect(projetoDe(links, 'outro')).toBeNull();
  });
});

describe('montarCaixa', () => {
  const grupos = [grupo('acme-app', '2026-10-28T12:00:00.000Z'), grupo('dm-5511', '2026-10-28T14:00:00.000Z'), grupo('calado', '2026-10-28T15:00:00.000Z')];

  it('pendentes: só quem espera, na ordem da fila, com projeto e espera traduzidos', () => {
    const itens = montarCaixa([espera('acme-app', 3 * 3600_000)], grupos, links, null, Date.parse('2026-10-28T14:30:00.000Z'));
    expect(itens).toEqual([
      {
        grupo: 'acme-app',
        nome: 'Nome acme-app',
        projeto: { cliente: 'Acme', repo: 'acme', github: 'org/acme' },
        esperando: {
          motivo: 'cliente_esperando',
          de: 'Tânia',
          previa: 'cadê o build?',
          desde: '2026-10-28T09:00:00.000Z',
          desde_brt: '28/10, 06:00',
          ha: 'há 3h',
          ultima_brt: '28/10, 09:00',
          ultima_ha: 'há 2h',
          faixa: 'warm',
        },
        do_cliente_desde: null,
        ultima: { previa: 'Fulano: oi de acme-app', quando: '2026-10-28T12:00:00.000Z' },
      },
    ]);
  });

  it('todos: pendentes primeiro, depois quem recebeu de cliente pela última atividade; sem msg de cliente fica fora', () => {
    const mov = new Map([
      ['acme-app', 2],
      ['dm-5511', 1],
      ['calado', 0],
    ]);
    const itens = montarCaixa([espera('acme-app', 1)], grupos, links, mov);
    expect(itens.map((i) => [i.grupo, i.esperando ? 'espera' : 'ok', i.do_cliente_desde])).toEqual([
      ['acme-app', 'espera', 2],
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

describe('encerramento', () => {
  it.each([
    'Ok',
    'ok. obrigada',
    'Combinado',
    'tranquilo',
    'Vou testar',
    'Pode ser assim mesmo',
    'Tudo ótimo Tadeu. Beleza maravilha obrigada',
    'Obrigada Tadeu, amanhã abro o e-mail e vemos tudo certinho 🙏🏻',
    'e agradeço as indicações, sempre muito bem vindas',
    '👍',
    '[figurinha]',
  ])('fecha o assunto: %s', (t) => {
    expect(encerramento(t)).toBe(true);
  });

  it.each([
    'opa tudo certo e vc?',
    'Já estou aqui á 2 semanas quase',
    'Obrigado, mas o app ainda não abre',
    'Tem algo do processo que esteja dependendo de mim? Além do api do wpp?',
    'Eu queria ver se podemos adiantar a parte de marketing, pra editar vídeos',
    '[áudio]',
    '[imagem]',
    'vou mandar o print do erro',
  ])('continua esperando: %s', (t) => {
    expect(encerramento(t)).toBe(false);
  });
});

describe('separarEspera', () => {
  const agora = Date.parse('2026-10-28T12:00:00.000Z');
  const item = (slug: string, timestamp: string, preview: string): InboxItem => ({ ...espera(slug, 0), timestamp, preview });

  it('encerrado sai com contagem; antigo vai pela última fala do cliente, não pelo início da espera', () => {
    const r = separarEspera(
      [
        item('fechou', '2026-10-28T11:00:00.000Z', 'Combinado'),
        item('velho', '2026-10-18T11:00:00.000Z', 'cadê o build?'),
        item('voltou', '2026-10-28T10:00:00.000Z', 'e aí, alguma novidade?'),
      ],
      7,
      agora,
    );
    expect(r.encerrados).toBe(1);
    expect(r.antigos.map((i) => i.slug)).toEqual(['velho']);
    expect(r.recentes.map((i) => i.slug)).toEqual(['voltou']);
  });

  it('menção nunca é tratada como encerramento', () => {
    const r = separarEspera([{ ...item('m', '2026-10-28T11:00:00.000Z', 'ok'), reason: 'mentioned' }], 7, agora);
    expect(r.recentes).toHaveLength(1);
  });
});
