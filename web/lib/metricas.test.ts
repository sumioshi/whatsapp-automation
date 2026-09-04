import { describe, expect, it } from 'vitest';
import { calcularMetricas, type EntradaMetrica } from './metricas';

const agora = Date.parse('2026-09-04T12:00:00.000Z');
const D = 24 * 60 * 60_000;
const iso = (msAntes: number) => new Date(agora - msAntes).toISOString();

const entradas: EntradaMetrica[] = [
  { slug: 'a', nome: 'A', mensagens: [
    { timestamp: iso(1 * D), fromMe: false }, { timestamp: iso(2 * D), fromMe: true }, { timestamp: iso(3 * D), fromMe: false },
  ] },
  { slug: 'b', nome: 'B', mensagens: [{ timestamp: iso(2 * D), fromMe: false }] },
  { slug: 'c', nome: 'C', mensagens: [{ timestamp: iso(20 * D), fromMe: false }] },
  { slug: 'd', nome: 'D', mensagens: [{ timestamp: iso(100 * D), fromMe: false }] },
  { slug: 'e', nome: 'E', mensagens: [] },
];

describe('calcularMetricas', () => {
  it('ranking na janela, com split cliente/operador', () => {
    const m = calcularMetricas(entradas, agora, '7d');
    expect(m.totalMensagens).toBe(4);
    expect(m.ranking.map((r) => [r.slug, r.total, r.cliente, r.operador])).toEqual([
      ['a', 3, 2, 1], ['b', 1, 1, 0], ['c', 0, 0, 0],
    ]);
    expect(m.maisAtivo?.slug).toBe('a');
  });
  it('menos ativo = menor total entre grupos vivos (msg nos últimos 90 d), fora os sem mensagem nenhuma', () => {
    const m = calcularMetricas(entradas, agora, '7d');
    expect(m.menosAtivo?.slug).toBe('c');
  });
  it('adormecidos: sem mensagem há mais de 14 dias, com dias arredondados', () => {
    const m = calcularMetricas(entradas, agora, '30d');
    expect(m.adormecidos).toEqual([{ slug: 'd', nome: 'D', dias: 100 }, { slug: 'c', nome: 'C', dias: 20 }]);
  });
  it('janela 24h só conta o último dia', () => {
    const m = calcularMetricas(entradas, agora, '24h');
    expect(m.totalMensagens).toBe(1);
    expect(m.ranking[0]).toMatchObject({ slug: 'a', total: 1 });
  });
  it('sem entradas: tudo vazio e nulo', () => {
    const m = calcularMetricas([], agora, '7d');
    expect(m).toEqual({ janela: '7d', totalMensagens: 0, ranking: [], maisAtivo: null, menosAtivo: null, adormecidos: [] });
  });
});
