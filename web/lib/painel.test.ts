import { describe, expect, it } from 'vitest';
import {
  autorDaMensagem,
  type ConversaPainel,
  diasDoPeriodo,
  entregasPorMes,
  faixasDeResposta,
  mediana,
  type MsgAtendimento,
  montarPainel,
  periodoDe,
  respostasDaConversa,
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
    expect(autorDaMensagem({ ...minha, origem: 'coletor' }, 'dono')).toBe('ia');
    expect(autorDaMensagem({ ...minha, origem: 'ia_meta' }, 'dono')).toBe('ia');
    expect(autorDaMensagem({ ...minha, origem: 'coletor', ator: 'painel', usuario: 'dono' }, 'dono')).toBe('painel');
    expect(autorDaMensagem({ ...minha, origem: 'coletor', ator: 'painel', usuario: 'ana' }, 'dono')).toBe('equipe');
    expect(autorDaMensagem(minha, 'dono')).toBe('sem-registro');
  });
  it('mensagem da própria conta sem fromMe (outro aparelho antigo) fica sem registro', () => {
    expect(autorDaMensagem({ papel: 'me' }, 'dono')).toBe('sem-registro');
  });
  it('sem dono configurado, carimbo do painel sem usuário conta como o próprio operador', () => {
    expect(autorDaMensagem({ fromMe: true, papel: 'me', ator: 'painel' }, null)).toBe('painel');
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
    expect(q.at(-1)?.pct).toBe(100);
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
