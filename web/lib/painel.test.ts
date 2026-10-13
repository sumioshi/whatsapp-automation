import { describe, expect, it } from 'vitest';
import {
  autorDaMensagem,
  type ConversaPainel,
  conversaDeTrabalho,
  diasDoPeriodo,
  entregasPorMes,
  faixasDeResposta,
  janelasDaFila,
  mediana,
  type MsgAtendimento,
  montarPainel,
  partesDoTempo,
  periodoDe,
  respostasDaConversa,
  rodapesDosIndicadores,
  resumoDeHoje,
  serieDiaria,
  variacao,
} from './painel';

const MIN = 60_000;
const H = 60 * MIN;
const ms = (iso: string) => Date.parse(iso);
/** 2026-10-12 é segunda; 18:00 UTC = 15:00 em Brasília. */
const AGORA = ms('2026-10-12T18:00:00Z');

function conversa(slug: string, msgs: Array<[string, MsgAtendimento['autor']]>, nome = slug): ConversaPainel {
  return { slug, nome, avatarPath: null, msgs: msgs.map(([iso, autor]) => ({ ms: ms(iso), autor })) };
}

describe('autorDaMensagem', () => {
  it('recebida de cliente é do cliente; de alguém do time é da equipe', () => {
    expect(autorDaMensagem({ papel: 'client' }, 'dono')).toBe('cliente');
    expect(autorDaMensagem({ papel: 'team' }, 'dono')).toBe('equipe');
  });
  it('a própria conta se divide pela origem e pelo carimbo do painel', () => {
    const minha = { fromMe: true, papel: 'me' as const };
    expect(autorDaMensagem({ ...minha, origem: 'celular' }, 'dono')).toBe('celular');
    expect(autorDaMensagem({ ...minha, origem: 'web' }, 'dono')).toBe('celular');
    expect(autorDaMensagem({ ...minha, origem: 'coletor', daFila: true }, 'dono')).toBe('ia');
    expect(autorDaMensagem({ ...minha, origem: 'ia_meta' }, 'dono')).toBe('ia');
    expect(autorDaMensagem({ ...minha, origem: 'coletor', ator: 'painel', usuario: 'dono' }, 'dono')).toBe('painel');
    expect(autorDaMensagem({ ...minha, origem: 'coletor', ator: 'painel', usuario: 'ana' }, 'dono')).toBe('equipe');
    expect(autorDaMensagem(minha, 'dono')).toBe('sem-registro');
  });
  it('saída do coletor sem carimbo só é da IA se veio de uma entrega da fila', () => {
    // Antes do carimbo do painel, a resposta do operador pelo painel também saía assim.
    expect(autorDaMensagem({ fromMe: true, papel: 'me', origem: 'coletor' }, 'dono')).toBe('sem-registro');
    expect(autorDaMensagem({ fromMe: true, papel: 'me', origem: 'coletor', daFila: false }, 'dono')).toBe('sem-registro');
  });
  it('mensagem da própria conta sem fromMe (outro aparelho antigo) fica sem registro', () => {
    expect(autorDaMensagem({ papel: 'me' }, 'dono')).toBe('sem-registro');
  });
  it('sem dono configurado, carimbo do painel sem usuário conta como o próprio operador', () => {
    expect(autorDaMensagem({ fromMe: true, papel: 'me', ator: 'painel' }, null)).toBe('painel');
  });
});

describe('janelasDaFila', () => {
  const t = (ticket: string, ts: string, estado: string, extra: Record<string, unknown> = {}) => ({
    ts,
    ticket,
    slug: 'norte',
    jid: 'norte@g.us',
    estado,
    iniciadoEm: null as string | null,
    duracao_s: 30,
    ...extra,
  });
  const daFila = janelasDaFila([
    t('a', '2026-10-12T12:00:00.000Z', 'agendado'),
    t('a', '2026-10-12T12:00:30.200Z', 'entregando', { iniciadoEm: '2026-10-12T12:00:30.000Z' }),
    t('a', '2026-10-12T12:00:40.000Z', 'entregando', { iniciadoEm: '2026-10-12T12:00:30.000Z' }),
    t('a', '2026-10-12T12:00:50.000Z', 'entregue', { iniciadoEm: '2026-10-12T12:00:30.000Z' }),
    t('so-agendado', '2026-10-12T14:00:00.000Z', 'agendado'),
    t('aberto', '2026-10-12T13:00:00.000Z', 'entregando', { iniciadoEm: '2026-10-12T12:59:50.000Z' }),
    t('outro', '2026-10-12T15:00:10.000Z', 'entregue', { slug: 'ebano', jid: 'v@g.us', iniciadoEm: '2026-10-12T15:00:00.000Z' }),
  ]);
  it('da digitação ao fim da entrega, com folga de segundos pelo arredondamento do WhatsApp', () => {
    expect(daFila('norte', 'norte@g.us', ms('2026-10-12T12:00:45Z'))).toBe(true);
    expect(daFila('norte', 'norte@g.us', ms('2026-10-12T12:00:54Z'))).toBe(true);
    expect(daFila('norte', 'norte@g.us', ms('2026-10-12T12:00:20Z'))).toBe(false);
    expect(daFila('norte', 'norte@g.us', ms('2026-10-12T12:01:30Z'))).toBe(false);
  });
  it('acha a conversa pelo slug ou pelo jid, e só a dela', () => {
    expect(daFila('norte-renomeado', 'norte@g.us', ms('2026-10-12T12:00:45Z'))).toBe(true);
    expect(daFila('norte', undefined, ms('2026-10-12T12:00:45Z'))).toBe(true);
    expect(daFila('ebano', 'v@g.us', ms('2026-10-12T12:00:45Z'))).toBe(false);
    expect(daFila('ebano', 'v@g.us', ms('2026-10-12T15:00:05Z'))).toBe(true);
  });
  it('agendado que não começou não conta; entrega sem fim registrado vale pela duração prevista', () => {
    expect(daFila('norte', 'norte@g.us', ms('2026-10-12T14:00:30Z'))).toBe(false);
    expect(daFila('norte', 'norte@g.us', ms('2026-10-12T13:01:00Z'))).toBe(true);
    expect(daFila('norte', 'norte@g.us', ms('2026-10-12T13:05:00Z'))).toBe(false);
  });
  it('sem registro de entregas, nada é da fila', () => {
    expect(janelasDaFila([])('norte', 'norte@g.us', ms('2026-10-12T12:00:45Z'))).toBe(false);
  });
});

describe('respostasDaConversa', () => {
  it('mede da primeira mensagem do cliente sem resposta até a primeira resposta', () => {
    const c = conversa('a', [
      ['2026-10-12T10:00:00Z', 'cliente'],
      ['2026-10-12T10:05:00Z', 'cliente'],
      ['2026-10-12T10:20:00Z', 'celular'],
      ['2026-10-12T10:21:00Z', 'ia'],
      ['2026-10-12T11:00:00Z', 'cliente'],
      ['2026-10-12T11:02:00Z', 'equipe'],
    ]);
    expect(respostasDaConversa(c.msgs)).toEqual([
      { ms: ms('2026-10-12T10:20:00Z'), esperaMs: 20 * MIN, quem: 'celular' },
      { ms: ms('2026-10-12T11:02:00Z'), esperaMs: 2 * MIN, quem: 'equipe' },
    ]);
  });
  it('mensagem nossa sem cliente esperando não é resposta, e espera em aberto não entra', () => {
    const c = conversa('a', [
      ['2026-10-12T09:00:00Z', 'ia'],
      ['2026-10-12T10:00:00Z', 'cliente'],
    ]);
    expect(respostasDaConversa(c.msgs)).toEqual([]);
  });
});

describe('mediana', () => {
  it('vazio é null; ímpar pega o meio; par faz a média dos dois do meio', () => {
    expect(mediana([])).toBeNull();
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('partesDoTempo', () => {
  it('menos de um minuto não vira zero; o resto segue a régua da espera', () => {
    expect(partesDoTempo(20_000)).toEqual([{ valor: '<1', unidade: 'min' }]);
    expect(partesDoTempo(18 * MIN)).toEqual([{ valor: '18', unidade: 'min' }]);
    expect(partesDoTempo(65 * MIN)).toEqual([
      { valor: '1', unidade: 'h' },
      { valor: '05', unidade: 'm' },
    ]);
  });
});

describe('variacao', () => {
  it('fração em relação ao anterior; sem base não há variação', () => {
    expect(variacao(120, 100)).toBeCloseTo(0.2);
    expect(variacao(90, 100)).toBeCloseTo(-0.1);
    expect(variacao(5, 0)).toBeNull();
    expect(variacao(null, 10)).toBeNull();
  });
});

describe('periodoDe', () => {
  it('aceita 7, 30 e 90; o resto vira 30', () => {
    expect(periodoDe('7')).toBe(7);
    expect(periodoDe('90')).toBe(90);
    expect(periodoDe('15')).toBe(30);
    expect(periodoDe(undefined)).toBe(30);
    expect(periodoDe(['7'])).toBe(7);
  });
});

describe('faixasDeResposta', () => {
  it('fronteiras: "até" inclui o limite', () => {
    const f = faixasDeResposta([5 * MIN, 5 * MIN + 1, 30 * MIN, 2 * H, 4 * H, 4 * H + 1]);
    expect(f.map((x) => x.n)).toEqual([1, 2, 1, 1, 1]);
    expect(f.map((x) => x.rotulo)).toEqual(['até 5 min', '5 a 30 min', '30 min a 2 h', '2 a 4 h', 'mais de 4 h']);
  });
  it('percentuais fecham 100 pelo maior resto', () => {
    const f = faixasDeResposta([1, 1, 1, 10 * MIN, 10 * MIN, 10 * MIN, H]);
    expect(f.reduce((s, x) => s + x.pct, 0)).toBe(100);
    expect(f.map((x) => x.pct)).toEqual([43, 43, 14, 0, 0]);
  });
  it('sem respostas, tudo zero', () => {
    expect(faixasDeResposta([]).map((x) => x.pct)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('dias em Brasília', () => {
  it('o período termina hoje (fuso de Brasília) e vem do mais antigo ao mais novo', () => {
    // 02:00 UTC do dia 12 ainda é dia 11 em Brasília.
    expect(diasDoPeriodo(ms('2026-10-12T02:00:00Z'), 3)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
  });
  it('série diária conta por dia de Brasília e ignora o que cai fora', () => {
    const dias = ['2026-10-10', '2026-10-11'];
    const s = serieDiaria([ms('2026-10-11T02:59:00Z'), ms('2026-10-11T03:00:00Z'), ms('2026-10-09T12:00:00Z')], dias);
    expect(s).toEqual([1, 1]);
  });
});

describe('entregasPorMes', () => {
  const f = (em: string) => ({ em });
  it('12 meses até o atual, com rótulo curto, e a média dos meses anteriores desde a primeira entrega', () => {
    const r = entregasPorMes(
      [f('2026-08-10T12:00:00Z'), f('2026-09-01T02:00:00Z'), f('2026-09-15T12:00:00Z'), f('2026-10-02T12:00:00Z')],
      AGORA,
    );
    expect(r.meses).toHaveLength(12);
    expect(r.meses[0]).toEqual({ mes: '2025-11', rotulo: 'nov', n: 0 });
    // 2026-09-01T02:00Z ainda é 31 de agosto em Brasília.
    expect(r.meses.slice(-3)).toEqual([
      { mes: '2026-08', rotulo: 'ago', n: 2 },
      { mes: '2026-09', rotulo: 'set', n: 1 },
      { mes: '2026-10', rotulo: 'out', n: 1 },
    ]);
    expect(r.media).toBeCloseTo(1.5);
    expect([r.atual, r.anterior, r.nomeMes, r.nomeMesAnterior]).toEqual([1, 1, 'outubro', 'setembro']);
  });
  it('sem entrega antes do mês atual não há média', () => {
    expect(entregasPorMes([f('2026-10-02T12:00:00Z')], AGORA).media).toBeNull();
    expect(entregasPorMes([], AGORA).media).toBeNull();
  });
});

describe('montarPainel', () => {
  const conversas = [
    conversa(
      'norte',
      [
        // período anterior (7 dias antes): 1 recebida, respondida em 40 min
        ['2026-10-01T12:00:00Z', 'cliente'],
        ['2026-10-01T12:40:00Z', 'celular'],
        // período atual: 3 recebidas
        ['2026-10-12T12:00:00Z', 'cliente'],
        ['2026-10-12T12:03:00Z', 'cliente'],
        ['2026-10-12T12:10:00Z', 'ia'],
        ['2026-10-12T13:00:00Z', 'cliente'],
        ['2026-10-12T19:00:00Z', 'painel'], // depois de agora: fora
      ],
      'Norte Logística',
    ),
    conversa('ebano', [['2026-10-08T14:00:00Z', 'cliente'], ['2026-10-08T14:02:00Z', 'equipe']], 'Clínica Ébano'),
  ];
  const p = montarPainel(conversas, [], AGORA, 7);

  it('recebidas no período, no anterior e a variação', () => {
    expect(p.dias).toEqual(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']);
    expect([p.recebidas.total, p.recebidas.anterior]).toEqual([4, 1]);
    expect(p.recebidas.variacao).toBeCloseTo(3);
    expect(p.recebidas.serie).toEqual([0, 0, 1, 0, 0, 0, 3]);
    expect(p.recebidas.serieAnterior).toEqual([0, 0, 1, 0, 0, 0, 0]);
  });
  it('primeira resposta: mediana do período e do anterior, por dia e quem respondeu', () => {
    expect(p.primeiraResposta.total).toBe(2);
    expect(p.primeiraResposta.medianaMs).toBe(6 * MIN); // 10 min e 2 min
    expect(p.primeiraResposta.anteriorMs).toBe(40 * MIN);
    expect(p.primeiraResposta.serieMediana).toEqual([null, null, 2 * MIN, null, null, null, 10 * MIN]);
    expect(p.quem.map((q) => [q.id, q.n, q.pct])).toEqual([
      ['celular', 0, 0],
      ['painel', 0, 0],
      ['equipe', 1, 50],
      ['ia', 1, 50],
    ]);
  });
  it('mais ativos por mensagens de cliente no período', () => {
    expect(p.maisAtivos.map((c) => [c.slug, c.n])).toEqual([
      ['norte', 3],
      ['ebano', 1],
    ]);
  });
  it('mapa de calor por dia da semana (segunda primeiro) e hora de Brasília', () => {
    expect(p.calor).toHaveLength(7);
    expect(p.calor[0]).toHaveLength(24);
    // segunda 12/10, 09:00 e 10:00 em Brasília
    expect(p.calor[0]?.[9]).toBe(2);
    expect(p.calor[0]?.[10]).toBe(1);
    // quinta 08/10, 11:00 em Brasília
    expect(p.calor[3]?.[11]).toBe(1);
    expect(p.calor.flat().reduce((s, n) => s + n, 0)).toBe(4);
  });
  it('resposta sem registro de origem só aparece quando existe', () => {
    const q = montarPainel([conversa('x', [['2026-10-12T10:00:00Z', 'cliente'], ['2026-10-12T10:01:00Z', 'sem-registro']])], [], AGORA, 7).quem;
    expect(q.map((x) => x.id)).toEqual(['celular', 'painel', 'equipe', 'ia', 'sem-registro']);
    expect(q.at(-1)?.rotulo).toBe('Sem registro');
    expect(q.at(-1)?.pct).toBe(100);
  });
});

describe('conversaDeTrabalho', () => {
  const dono = new Set(['5511999990000']);
  it('fica de fora o que o painel silenciou, o que é só pessoal e a conversa consigo mesmo', () => {
    expect(conversaDeTrabalho({ slug: 'norte', etiquetas: ['Contrato'] }, false, dono)).toBe(true);
    expect(conversaDeTrabalho({ slug: 'dm-551188887777' }, false, dono)).toBe(true);
    expect(conversaDeTrabalho({ slug: 'norte' }, true, dono)).toBe(false);
    expect(conversaDeTrabalho({ slug: 'dm-1', etiquetas: ['Pessoal'] }, false, dono)).toBe(false);
    expect(conversaDeTrabalho({ slug: 'dm-1', etiquetas: ['Pessoal', 'Lead'] }, false, dono)).toBe(true);
    expect(conversaDeTrabalho({ slug: 'dm-5511999990000' }, false, dono)).toBe(false);
  });
});

describe('rodapesDosIndicadores', () => {
  const base = montarPainel([], [], AGORA, 30);
  it('mais mensagens ganha o chip verde; menos fica neutro; sem base não há chip', () => {
    const p = { ...base, recebidas: { ...base.recebidas, total: 112, anterior: 100, variacao: 0.12 } };
    expect(rodapesDosIndicadores(p).recebidas).toEqual({ chip: { texto: '+12%', tom: 'ok' }, texto: 'vs. 30 dias anteriores' });
    const menos = { ...base, recebidas: { ...base.recebidas, total: 90, anterior: 100, variacao: -0.1 } };
    expect(rodapesDosIndicadores(menos).recebidas.chip).toEqual({ texto: '−10%', tom: 'neutro' });
    expect(rodapesDosIndicadores(base).recebidas).toEqual({ chip: null, texto: 'nenhuma nos 30 dias anteriores' });
  });
  it('primeira resposta: cair é bom (verde), subir pede atenção', () => {
    const r = (variacao: number | null, medianaMs: number | null) =>
      rodapesDosIndicadores({ ...base, primeiraResposta: { ...base.primeiraResposta, variacao, medianaMs } }).resposta;
    expect(r(-0.09, 18 * MIN)).toEqual({ chip: { texto: '−9%', tom: 'ok' }, texto: 'mais rápido que antes' });
    expect(r(0.25, 18 * MIN)).toEqual({ chip: { texto: '+25%', tom: 'atencao' }, texto: 'mais lento que antes' });
    expect(r(0, 18 * MIN)).toEqual({ chip: { texto: '0%', tom: 'neutro' }, texto: 'igual aos 30 dias anteriores' });
    expect(r(null, 18 * MIN)).toEqual({ chip: null, texto: 'sem respostas nos 30 dias anteriores' });
    expect(r(null, null)).toEqual({ chip: null, texto: 'sem respostas no período' });
  });
  it('entregas: diferença para o mês anterior', () => {
    const e = (atual: number, anterior: number) =>
      rodapesDosIndicadores({ ...base, entregas: { ...base.entregas, atual, anterior, nomeMesAnterior: 'setembro' } }).entregas;
    expect(e(11, 9)).toEqual({ chip: { texto: '+2', tom: 'ok' }, texto: '9 em setembro' });
    expect(e(3, 9)).toEqual({ chip: { texto: '−6', tom: 'neutro' }, texto: '9 em setembro' });
    expect(e(0, 0)).toEqual({ chip: null, texto: 'nenhuma em setembro' });
  });
});

describe('resumoDeHoje', () => {
  it('mediana das respostas de hoje e o que a IA enviou hoje (Brasília)', () => {
    const c = conversa('a', [
      ['2026-10-12T02:00:00Z', 'cliente'], // dia 11 em Brasília
      ['2026-10-12T02:30:00Z', 'ia'], // resposta ainda do dia 11
      ['2026-10-12T12:00:00Z', 'cliente'],
      ['2026-10-12T12:20:00Z', 'ia'],
      ['2026-10-12T12:21:00Z', 'ia'],
      ['2026-10-12T13:00:00Z', 'cliente'],
      ['2026-10-12T13:10:00Z', 'celular'],
    ]);
    expect(resumoDeHoje([c], AGORA)).toEqual({ medianaMs: 15 * MIN, respostas: 2, iaEnviadas: 2 });
  });
});
