import { describe, expect, it } from 'vitest';
import { CONTRATO_PADRAO, type Contrato } from './contratos';
import { type Feature } from './features';
import { ATIVO_MIN_MSGS, explicarSinal, montarDashboard } from './dashboard';
import type { EntradaMetrica } from './metricas';

const agora = Date.parse('2026-09-04T12:00:00.000Z');
const D = 86_400_000;
const iso = (diasAtras: number) => new Date(agora - diasAtras * D).toISOString();
const ymd = (diasDaqui: number) => new Date(agora + diasDaqui * D).toISOString().slice(0, 10);

function chat(slug: string, msgsCliente: number, msgsMinhas = 0): EntradaMetrica {
  const m: EntradaMetrica['mensagens'] = [];
  for (let i = 0; i < msgsCliente; i++) m.push({ timestamp: iso(1 + (i % 20)), fromMe: false });
  for (let i = 0; i < msgsMinhas; i++) m.push({ timestamp: iso(2), fromMe: true });
  return { slug, nome: slug.toUpperCase(), mensagens: m };
}
const contrato = (over: Partial<Contrato>): Contrato => ({ ...CONTRATO_PADRAO, ...over });
const feat = (slug: string, diasAtras: number, ref = `https://x/${slug}/${diasAtras}`): Feature => ({
  id: `${diasAtras}`, slug, nome: `f${diasAtras}`, ref, origem: 'pr', em: iso(diasAtras), por: null,
});

describe('montarDashboard — sinais', () => {
  it('encerrado-ativo e pausado-ativo só com atividade >= ATIVO_MIN_MSGS', () => {
    const d = montarDashboard(
      [chat('a', ATIVO_MIN_MSGS), chat('b', ATIVO_MIN_MSGS - 1), chat('p', 9)],
      { a: contrato({ estado: 'encerrado' }), b: contrato({ estado: 'encerrado' }), p: contrato({ estado: 'pausado' }) },
      [], agora,
    );
    const por = Object.fromEntries(d.linhas.map((l) => [l.slug, l.sinais]));
    expect(por.a).toContain('encerrado-ativo');
    expect(por.b).not.toContain('encerrado-ativo');
    expect(por.p).toContain('pausado-ativo');
  });
  it('fim passado conta como encerrado; sem-contrato-ativo; renovacao-30d só ativo com fim em <= 30d', () => {
    const d = montarDashboard(
      [chat('a', 6), chat('s', 6), chat('r', 1), chat('t', 1)],
      { a: contrato({ estado: 'ativo', fim: ymd(-1) }), r: contrato({ estado: 'ativo', fim: ymd(20) }), t: contrato({ estado: 'ativo', fim: ymd(45) }) },
      [], agora,
    );
    const por = Object.fromEntries(d.linhas.map((l) => [l.slug, l.sinais]));
    expect(por.a).toContain('encerrado-ativo');
    expect(por.s).toContain('sem-contrato-ativo');
    expect(por.r).toEqual(['renovacao-30d']);
    expect(por.t).toEqual([]);
  });
  it('sem-entrega-30d: ativo, falando e sem entrega em 30d; com entrega recente não', () => {
    const d = montarDashboard(
      [chat('a', 8), chat('b', 8)],
      { a: contrato({ estado: 'ativo' }), b: contrato({ estado: 'ativo' }) },
      [feat('b', 3), feat('a', 40)], agora,
    );
    const por = Object.fromEntries(d.linhas.map((l) => [l.slug, l]));
    expect(por.a?.sinais).toContain('sem-entrega-30d');
    expect(por.a?.featuresTotal).toBe(1);
    expect(por.a?.features30d).toBe(0);
    expect(por.b?.sinais).not.toContain('sem-entrega-30d');
    expect(por.b?.ultimaFeatureEm).toBe(iso(3));
  });
});

describe('montarDashboard — custos, totais e ordem', () => {
  it('msgs por entrega e valor por entrega; null sem dado', () => {
    const d = montarDashboard(
      [chat('a', 10, 4), chat('b', 10)],
      { a: contrato({ estado: 'ativo', valorMensal: 3000 }), b: contrato({ estado: 'ativo' }) },
      [feat('a', 1), feat('a', 2)], agora,
    );
    const a = d.linhas.find((l) => l.slug === 'a');
    const b = d.linhas.find((l) => l.slug === 'b');
    expect(a).toMatchObject({ msgs30d: 14, msgsCliente30d: 10, features30d: 2, msgsPorFeature30d: 5, valorPorFeature: 1500 });
    expect(b).toMatchObject({ features30d: 0, msgsPorFeature30d: null, valorPorFeature: null });
    expect(d.totais).toEqual({ clientes: 2, ativos: 2, encerrados: 0, features30d: 2, comSinal: 1 });
  });
  it('ordena: mais sinais primeiro, depois mais msgs de cliente', () => {
    // x e y empatam em 1 sinal (encerrado-ativo / renovacao-30d); o desempate
    // "mais msgs de cliente" exige que x tenha mais msgsCliente30d que y para
    // x vir primeiro — por isso 9/6 (não 6/9): ver task-3-report.md.
    const d = montarDashboard(
      [chat('x', 9), chat('y', 6), chat('z', 20)],
      { x: contrato({ estado: 'encerrado' }), y: contrato({ estado: 'ativo', fim: ymd(5) }), z: contrato({ estado: 'ativo' }) },
      [feat('z', 2), feat('y', 2)], agora,
    );
    expect(d.linhas.map((l) => l.slug)).toEqual(['x', 'y', 'z']);
  });
  it('explicarSinal tem frase pra cada sinal', () => {
    for (const s of ['encerrado-ativo', 'sem-contrato-ativo', 'pausado-ativo', 'renovacao-30d', 'sem-entrega-30d'] as const) {
      expect(explicarSinal(s).length).toBeGreaterThan(10);
    }
  });
});
