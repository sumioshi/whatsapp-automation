import { describe, expect, it } from 'vitest';
import type { Contrato } from './contratos';
import type { Evento } from './google/evento';
import {
  agendaDoDia,
  compromissosRestantes,
  contratosNoLimite,
  dataPorExtenso,
  estadoDoColetor,
  fraseDoDia,
  interrompidasHoje,
  ordenarTickets,
  resumoDaFila,
  resumoEsperando,
  sinaisDoDia,
  textoDaFila,
  textoEntregasAnteriores,
} from './hoje';

const MIN = 60_000;
const H = 60 * MIN;
const ms = (iso: string) => Date.parse(iso);
/** Segunda, 12 de outubro de 2026, 15:00 em Brasília. */
const AGORA = ms('2026-10-12T18:00:00Z');

describe('dataPorExtenso', () => {
  it('dia da semana, dia e mês em Brasília', () => {
    // 23:00 de quarta em Brasília, já quinta em UTC
    expect(dataPorExtenso(ms('2026-10-08T02:00:00Z'))).toBe('Quarta, 7 de outubro');
    expect(dataPorExtenso(ms('2026-10-11T15:00:00Z'))).toBe('Domingo, 11 de outubro');
    expect(dataPorExtenso(ms('2026-03-01T12:00:00Z'))).toBe('Domingo, 1 de março');
  });
});

describe('fraseDoDia', () => {
  it('junta as três partes com vírgula e "e", no plural ou no singular', () => {
    expect(fraseDoDia({ esperando: 7, comIa: 2, compromissos: 2 })).toBe(
      '7 clientes esperando resposta, a IA cuidando de 2 conversas e 2 compromissos até o fim do dia.',
    );
    expect(fraseDoDia({ esperando: 1, comIa: 1, compromissos: 1 })).toBe(
      '1 cliente esperando resposta, a IA cuidando de 1 conversa e 1 compromisso até o fim do dia.',
    );
  });
  it('zero vira frase de dia calmo', () => {
    expect(fraseDoDia({ esperando: 0, comIa: 0, compromissos: 0 })).toBe(
      'Ninguém esperando resposta, a IA sem envios na fila e nenhum compromisso até o fim do dia.',
    );
  });
  it('o que ainda não se sabe (agenda ou fila fora do ar) fica de fora', () => {
    expect(fraseDoDia({ esperando: 3, comIa: null, compromissos: null })).toBe('3 clientes esperando resposta.');
    expect(fraseDoDia({ esperando: 3, comIa: 2, compromissos: null })).toBe(
      '3 clientes esperando resposta e a IA cuidando de 2 conversas.',
    );
    expect(fraseDoDia({ esperando: 0, comIa: null, compromissos: 4 })).toBe(
      'Ninguém esperando resposta e 4 compromissos até o fim do dia.',
    );
  });
});

describe('resumoEsperando', () => {
  it('conta o total e quem passou de 4 h (a mesma régua do anel)', () => {
    expect(resumoEsperando([{ waitingMs: 4 * H }, { waitingMs: 4 * H + 1 }, { waitingMs: 10 * MIN }])).toEqual({
      total: 3,
      acimaDe4h: 1,
      paradas: 0,
    });
  });
  it('espera de mais de 7 dias fica de fora do total e conta à parte, como na Caixa', () => {
    expect(resumoEsperando([{ waitingMs: 2 * H }, { waitingMs: 7 * 24 * H + 1 }, { waitingMs: 30 * 24 * H }])).toEqual({
      total: 1,
      acimaDe4h: 0,
      paradas: 2,
    });
  });
});

describe('estadoDoColetor', () => {
  it('aberto, pareando (QR ou conectando) ou desconectado', () => {
    expect(estadoDoColetor({ connection: 'open' })).toBe('conectado');
    expect(estadoDoColetor({ connection: 'close', qr: 'abc' })).toBe('pareando');
    expect(estadoDoColetor({ connection: 'connecting' })).toBe('pareando');
    expect(estadoDoColetor({ connection: 'qr' })).toBe('pareando');
    expect(estadoDoColetor({ connection: 'close' })).toBe('desconectado');
    expect(estadoDoColetor(null)).toBe('desconectado');
  });
});

describe('textoEntregasAnteriores', () => {
  it('compara com o mês anterior em texto curto', () => {
    expect(textoEntregasAnteriores(9, 'setembro')).toBe('9 em setembro');
    expect(textoEntregasAnteriores(1, 'setembro')).toBe('1 em setembro');
    expect(textoEntregasAnteriores(0, 'setembro')).toBe('nenhuma em setembro');
  });
});

describe('sinaisDoDia', () => {
  const contrato = (c: Partial<Contrato>): Contrato => ({
    estado: 'ativo',
    inicio: null,
    fim: null,
    valorMensal: null,
    limiteMensagens: null,
    nota: '',
    ...c,
  });
  const linhas = [
    { slug: 'rota', nome: 'Rota Fit', contrato: contrato({}), sinais: ['sem-entrega-30d' as const] },
    { slug: 'alfa', nome: 'Alfa Imóveis', contrato: contrato({ fim: '2026-11-04' }), sinais: ['renovacao-30d' as const] },
    { slug: 'casa', nome: 'Casa Lima', contrato: contrato({ estado: 'encerrado' }), sinais: ['encerrado-ativo' as const] },
    { slug: 'pires', nome: 'Oficina Pires', contrato: contrato({ fim: '2026-10-01' }), sinais: ['encerrado-ativo' as const] },
    { slug: 'nova', nome: 'Nova', contrato: contrato({ estado: 'sem' }), sinais: ['sem-contrato-ativo' as const] },
    { slug: 'verde', nome: 'Verde Agro', contrato: contrato({ estado: 'pausado' }), sinais: ['pausado-ativo' as const] },
    { slug: 'amanha', nome: 'Amanhã', contrato: contrato({ fim: '2026-10-13' }), sinais: ['renovacao-30d' as const] },
    { slug: 'ebano', nome: 'Clínica Ébano', contrato: contrato({ limiteMensagens: 300 }), sinais: ['acima-do-contrato' as const] },
  ];
  const esperando = [
    { slug: 'norte', groupName: 'Norte Logística', waitingMs: 26 * H },
    { slug: 'bonito', groupName: 'Café Bonito', waitingMs: 3 * 24 * H + 5 * H },
    { slug: 'trigal', groupName: 'Padaria Trigal', waitingMs: 5 * H },
  ];
  const s = sinaisDoDia(linhas, esperando, AGORA);

  it('texto curto por sinal, com a contagem de dias até a renovação', () => {
    expect(s.map((x) => [x.slug, x.texto, x.tom])).toEqual([
      ['norte', 'sem resposta há 26 h', 'perigo'],
      ['bonito', 'sem resposta há 3 dias', 'perigo'],
      ['casa', 'contrato encerrado', 'perigo'],
      ['pires', 'contrato vencido', 'perigo'],
      ['rota', 'sem entrega há 30 dias', 'atencao'],
      ['nova', 'ativo sem contrato', 'atencao'],
      ['verde', 'pausado, mas ativo', 'atencao'],
      ['ebano', 'acima do contrato', 'atencao'],
      ['alfa', 'renova em 23 dias', 'neutro'],
      ['amanha', 'renova amanhã', 'neutro'],
    ]);
  });
  it('cada item tem chave única', () => {
    expect(new Set(s.map((x) => x.chave)).size).toBe(s.length);
  });
  it('cada item explica o que fazer, como a lista do painel', () => {
    expect(s.find((x) => x.slug === 'norte')?.explicacao).toBe(
      'cliente esperando resposta há mais de 24 h: responder ou marcar como resolvido na caixa',
    );
    expect(s.find((x) => x.slug === 'rota')?.explicacao).toBe(
      'cliente ativo e pagando, sem nenhuma entrega registrada em 30 dias',
    );
  });
});

describe('contratosNoLimite', () => {
  const linha = (slug: string, msgsCliente30d: number, c: Partial<Contrato>) => ({
    slug,
    nome: slug.toUpperCase(),
    msgsCliente30d,
    contrato: { estado: 'ativo' as const, inicio: null, fim: null, valorMensal: null, limiteMensagens: null, nota: '', ...c },
  });
  it('só contrato ativo com limite, do mais acima do limite para o mais folgado', () => {
    const r = contratosNoLimite(
      [
        linha('folgado', 40, { limiteMensagens: 200 }),
        linha('acima', 412, { limiteMensagens: 300 }),
        linha('perto', 142, { limiteMensagens: 150 }),
        linha('semLimite', 900, {}),
        linha('pausado', 500, { estado: 'pausado', limiteMensagens: 100 }),
        linha('vencido', 500, { limiteMensagens: 100, fim: '2026-10-01' }),
      ],
      AGORA,
    );
    expect(r).toEqual([
      { slug: 'acima', nome: 'ACIMA', valor: 412, limite: 300 },
      { slug: 'perto', nome: 'PERTO', valor: 142, limite: 150 },
      { slug: 'folgado', nome: 'FOLGADO', valor: 40, limite: 200 },
    ]);
  });
  it('empate no uso vai para quem mandou mais', () => {
    const r = contratosNoLimite([linha('a', 50, { limiteMensagens: 100 }), linha('b', 100, { limiteMensagens: 200 })], AGORA);
    expect(r.map((x) => x.slug)).toEqual(['b', 'a']);
  });
});

describe('fila da IA', () => {
  const t = (ticket: string, estado: string, entregarEm: string, iniciadoEm: string | null = null) => ({
    ticket,
    slug: ticket,
    estado,
    enviados: 0,
    total: 2,
    entregarEm,
    iniciadoEm,
  });
  const tickets = [
    t('b', 'agendado', '2026-10-12T18:40:00Z'),
    t('a', 'entregando', '2026-10-12T17:59:00Z', '2026-10-12T17:59:30Z'),
    t('c', 'agendado', '2026-10-12T18:20:00Z'),
    t('fim', 'entregue', '2026-10-12T17:00:00Z'),
  ];
  it('conta só o que está vivo e acha a próxima entrega', () => {
    expect(resumoDaFila(tickets)).toEqual({ total: 3, entregando: 1, agendados: 2, proximaMs: ms('2026-10-12T18:20:00Z') });
  });
  it('entregando primeiro, depois agendado pelo horário', () => {
    expect(ordenarTickets(tickets).map((x) => x.ticket)).toEqual(['a', 'c', 'b']);
  });
  it('texto da célula "Com a IA"', () => {
    expect(textoDaFila(resumoDaFila(tickets))).toBe('1 entregando agora');
    expect(textoDaFila(resumoDaFila([tickets[0] as (typeof tickets)[number]]))).toBe('próxima às 15:40');
    expect(textoDaFila(resumoDaFila([]))).toBe('nada na fila');
    expect(textoDaFila(null)).toBe('fila indisponível');
  });
});

describe('interrompidasHoje', () => {
  it('tickets distintos interrompidos hoje (Brasília) no registro de entregas', () => {
    const linhas = [
      { ts: '2026-10-12T12:00:00Z', ticket: 'a', estado: 'agendado' },
      { ts: '2026-10-12T12:01:00Z', ticket: 'a', estado: 'interrompido' },
      { ts: '2026-10-12T12:01:00Z', ticket: 'a', estado: 'interrompido' },
      { ts: '2026-10-12T14:00:00Z', ticket: 'b', estado: 'interrompido' },
      { ts: '2026-10-12T02:00:00Z', ticket: 'c', estado: 'interrompido' }, // dia 11 em Brasília
      { ts: '2026-10-12T15:00:00Z', ticket: 'd', estado: 'entregue' },
    ];
    expect(interrompidasHoje(linhas, AGORA)).toBe(2);
  });
});

describe('agenda do dia', () => {
  const ev = (id: string, inicio: string, fim: string, extra: Partial<Evento> = {}): Evento => ({
    id,
    agenda: 'principal',
    titulo: id,
    inicio,
    fim,
    diaInteiro: false,
    convidados: [],
    recorrente: false,
    editavel: true,
    cor: '#2459d6',
    ...extra,
  });
  const eventos = [
    ev('radar', '2026-10-12T09:00:00-03:00', '2026-10-12T09:15:00-03:00', { local: 'lembrete do radar' }),
    ev('call', '2026-10-12T11:00:00-03:00', '2026-10-12T12:00:00-03:00', { meet: 'https://meet.google.com/x' }),
    ev('agora', '2026-10-12T14:30:00-03:00', '2026-10-12T15:30:00-03:00', { convidados: ['a@x', 'b@x'] }),
    ev('entrega', '2026-10-12T15:43:00-03:00', '2026-10-12T16:30:00-03:00'),
    ev('revisar', '2026-10-12T18:30:00-03:00', '2026-10-12T19:00:00-03:00'),
    ev('prazo', '2026-10-12', '2026-10-13', { diaInteiro: true }),
    ev('ontem', '2026-10-11T09:00:00-03:00', '2026-10-11T10:00:00-03:00'),
  ];

  it('faixa das 8 às 20 h com os blocos do dia e a linha do agora', () => {
    const a = agendaDoDia(eventos, AGORA, 10);
    expect([a.inicioH, a.fimH, a.marcas]).toEqual([8, 20, [8, 11, 14, 17, 20]]);
    expect(a.agora).toBeCloseTo((7 / 12) * 100);
    const radar = a.blocos.find((b) => b.chave === 'principal|radar');
    expect(radar?.esquerda).toBeCloseTo((1 / 12) * 100);
    expect(radar?.largura).toBeCloseTo((15 / 720) * 100);
    expect(radar?.passado).toBe(true);
    expect(a.blocos.some((b) => b.chave.endsWith('ontem') || b.chave.endsWith('prazo'))).toBe(false);
  });
  it('lista: dia todo primeiro, depois por horário, com estado e detalhe', () => {
    const a = agendaDoDia(eventos, AGORA, 10);
    expect(a.itens.map((i) => [i.titulo, i.quando, i.estado, i.detalhe])).toEqual([
      ['prazo', 'dia todo', 'normal', 'só você'],
      ['radar', '09:00', 'passado', 'lembrete do radar'],
      ['call', '11:00', 'passado', 'Google Meet'],
      ['agora', '14:30', 'agora', 'agora, até 15:30'],
      ['entrega', '15:43', 'proximo', 'daqui a 43 min'],
      ['revisar', '18:30', 'normal', 'só você'],
    ]);
    expect(a.restantes).toBe(0);
  });
  it('sem espaço, os já passados saem primeiro', () => {
    const a = agendaDoDia(eventos, AGORA, 4);
    expect(a.itens.map((i) => i.titulo)).toEqual(['prazo', 'agora', 'entrega', 'revisar']);
    expect(a.restantes).toBe(2);
  });
  it('evento curto ganha largura mínima na faixa', () => {
    const a = agendaDoDia([ev('rapido', '2026-10-12T10:00:00-03:00', '2026-10-12T10:05:00-03:00')], AGORA);
    expect(a.blocos[0]?.largura).toBeCloseTo(1.6);
  });
  it('evento cedo ou tarde estica a faixa, que fecha em múltiplo de 4 h para as marcas caírem em horas cheias', () => {
    const tarde = agendaDoDia([ev('tarde', '2026-10-12T21:00:00-03:00', '2026-10-12T22:10:00-03:00')], AGORA);
    expect([tarde.inicioH, tarde.fimH, tarde.marcas]).toEqual([8, 24, [8, 12, 16, 20, 24]]);
    const ambos = agendaDoDia(
      [ev('cedo', '2026-10-12T06:30:00-03:00', '2026-10-12T07:00:00-03:00'), ev('tarde', '2026-10-12T21:00:00-03:00', '2026-10-12T22:10:00-03:00')],
      AGORA,
    );
    expect([ambos.inicioH, ambos.fimH, ambos.marcas]).toEqual([4, 24, [4, 9, 14, 19, 24]]);
  });
  it('próximo distante mostra horas e minutos', () => {
    const a = agendaDoDia([ev('longe', '2026-10-12T17:20:00-03:00', '2026-10-12T18:00:00-03:00')], AGORA);
    expect(a.itens[0]?.detalhe).toBe('daqui a 2 h 20 min');
  });
  it('compromissos até o fim do dia: com horário e ainda não terminados', () => {
    expect(compromissosRestantes(eventos, AGORA)).toBe(3);
  });
});
