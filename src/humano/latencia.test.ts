import { describe, expect, it } from 'vitest';
import { calcularLatencia, type EntradaLatencia, fatorHora, LATENCIA, lognormal } from './latencia';

function seeded(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

const base: EntradaLatencia = {
  gapDesdeCliente_s: 20,
  hora: 14,
  diaSemana: 2,
  latenciaClienteMediana_s: null,
  latenciaOperadorMediana_s: null,
  foraDoExpediente: false,
  segurarPor_s: null,
  urgencia: 'normal',
  decorrido_s: 0,
  latenciaMaxima_s: LATENCIA.latenciaMaximaPadrao_s,
};

describe('calcularLatencia — regimes', () => {
  it('urgencia agora: só a janela de cancelamento (5 s), visto imediato', () => {
    const s = calcularLatencia({ ...base, urgencia: 'agora' }, seeded(1));
    expect(s).toEqual({
      esperaAteLer_s: 0,
      esperaAteDigitar_s: LATENCIA.janelaCancelamento_s,
      regime: 'agora',
    });
  });

  it('conversa ativa (gap < 13 min): 1000 sorteios ficam em [5 s, 240 s] com mediana entre 20 e 45 s', () => {
    const rng = seeded(7);
    const xs = Array.from(
      { length: 1000 },
      () => calcularLatencia(base, rng).esperaAteDigitar_s,
    ).sort((a, b) => a - b);
    expect(xs[0]).toBeGreaterThanOrEqual(5);
    expect(xs[999]).toBeLessThanOrEqual(240);
    const med = xs[500]!;
    expect(med).toBeGreaterThanOrEqual(20);
    expect(med).toBeLessThanOrEqual(45);
    expect(calcularLatencia(base, seeded(3)).regime).toBe('ativa');
  });

  it('conversa fria (gap ≥ 13 min ou sem mensagem do cliente): cai nas faixas medidas', () => {
    const rng = seeded(11);
    const xs = Array.from(
      { length: 2000 },
      () => calcularLatencia({ ...base, gapDesdeCliente_s: 3600 }, rng).esperaAteDigitar_s,
    );
    const frac = (lo: number, hi: number) => xs.filter((x) => x >= lo && x < hi).length / xs.length;
    expect(frac(0, 60)).toBeGreaterThan(0.45);
    expect(frac(0, 60)).toBeLessThan(0.67);
    expect(frac(3600, 14401)).toBeGreaterThan(0.08);
    expect(Math.max(...xs)).toBeLessThanOrEqual(LATENCIA.latenciaMaximaPadrao_s);
    expect(calcularLatencia({ ...base, gapDesdeCliente_s: null }, rng).regime).toBe('fria');
  });

  it('urgencia calma força o regime frio mesmo em conversa ativa', () => {
    expect(calcularLatencia({ ...base, urgencia: 'calma' }, seeded(2)).regime).toBe('fria');
  });
});

describe('calcularLatencia — modificadores', () => {
  it('reciprocidade: média geométrica com a mediana do cliente (e do operador quando existe)', () => {
    const rngMediana = () => 0.5;
    const solo = calcularLatencia(base, rngMediana).esperaAteDigitar_s;
    const cliente = calcularLatencia(
      { ...base, latenciaClienteMediana_s: 480 },
      rngMediana,
    ).esperaAteDigitar_s;
    expect(cliente).toBeCloseTo(Math.sqrt(solo * 480), 0);
    const ambos = calcularLatencia(
      { ...base, latenciaClienteMediana_s: 480, latenciaOperadorMediana_s: 60 },
      rngMediana,
    ).esperaAteDigitar_s;
    expect(ambos).toBeCloseTo(Math.cbrt(solo * 480 * 60), 0);
  });

  it('hora local e fim de semana multiplicam', () => {
    expect(fatorHora(3, 2)).toBe(4);
    expect(fatorHora(8, 2)).toBe(1.5);
    expect(fatorHora(14, 2)).toBe(1);
    expect(fatorHora(22, 2)).toBe(1.8);
    expect(fatorHora(14, 0)).toBe(1.5);
    expect(fatorHora(3, 6)).toBe(6);
  });

  it('fora do expediente ×2,5 sem segurar; com segurarPor_s a espera cobre até a abertura', () => {
    const rng = () => 0.5;
    const dentro = calcularLatencia(base, rng).esperaAteDigitar_s;
    const fora = calcularLatencia({ ...base, foraDoExpediente: true }, rng).esperaAteDigitar_s;
    expect(fora).toBeCloseTo(Math.min(dentro * 2.5, 240), 0);
    const segurado = calcularLatencia({ ...base, foraDoExpediente: true, segurarPor_s: 9000 }, rng);
    expect(segurado.esperaAteDigitar_s).toBe(9000);
    expect(segurado.esperaAteLer_s).toBeLessThanOrEqual(9000);
  });

  it('desconta o tempo já gasto pelo agente, mas nunca abaixo da janela de 5 s', () => {
    const rng = () => 0.5;
    const cheio = calcularLatencia(base, rng).esperaAteDigitar_s;
    const parcial = calcularLatencia({ ...base, decorrido_s: 10 }, rng).esperaAteDigitar_s;
    expect(parcial).toBeCloseTo(Math.max(5, cheio - 10), 5);
    expect(calcularLatencia({ ...base, decorrido_s: 10_000 }, rng).esperaAteDigitar_s).toBe(5);
  });

  it('clamp na latência máxima do chat', () => {
    const s = calcularLatencia(
      { ...base, gapDesdeCliente_s: 7200, latenciaMaxima_s: 120 },
      () => 0.99,
    );
    expect(s.esperaAteDigitar_s).toBeLessThanOrEqual(120);
  });

  it('visto: ≤ espera de digitar; piso 2 s em conversa ativa', () => {
    const rng = seeded(5);
    for (let i = 0; i < 200; i++) {
      const s = calcularLatencia(base, rng);
      expect(s.esperaAteLer_s).toBeLessThanOrEqual(s.esperaAteDigitar_s);
      expect(s.esperaAteLer_s).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('lognormal', () => {
  it('rng 0,5 devolve a mediana', () => {
    expect(lognormal(30, 0.9, () => 0.5)).toBeCloseTo(30, 6);
  });
});
