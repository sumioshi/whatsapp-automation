import { describe, expect, it } from 'vitest';
import {
  calcularLatencia,
  type EntradaLatencia,
  estimarConsumo,
  fatorHora,
  LATENCIA,
  lognormal,
} from './latencia';

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

describe('estimarConsumo — tempo de assistir/ouvir/ler o que o cliente mandou', () => {
  const amostras = (p: Parameters<typeof estimarConsumo>[0], n = 500) => {
    const rng = seeded(13);
    return Array.from({ length: n }, () => estimarConsumo(p, rng)).sort((a, b) => a - b);
  };

  it('vídeo de 5 min: entre 0,6× e 1,3× a duração, nunca o mesmo valor', () => {
    const xs = amostras([{ type: 'video', duracao_s: 300 }]);
    expect(xs[0]).toBeGreaterThanOrEqual(180);
    expect(xs[xs.length - 1]).toBeLessThanOrEqual(390);
    expect(new Set(xs).size).toBeGreaterThan(400);
  });

  it('áudio: entre 0,5× e 1,1× (acelerado às vezes)', () => {
    const xs = amostras([{ type: 'audio', duracao_s: 60 }]);
    expect(xs[0]).toBeGreaterThanOrEqual(30);
    expect(xs[xs.length - 1]).toBeLessThanOrEqual(66);
  });

  it('documento: cresce com as páginas, com teto por documento', () => {
    const curto = amostras([{ type: 'document', paginas: 1 }]);
    const longo = amostras([{ type: 'document', paginas: 10 }]);
    expect(longo[250]!).toBeGreaterThan(curto[250]! * 3);
    const enorme = amostras([{ type: 'document', paginas: 500 }]);
    expect(enorme[enorme.length - 1]).toBeLessThanOrEqual(LATENCIA.consumoDocTeto_s);
  });

  it('mídia sem duração gravada usa um padrão, texto conta pelo tamanho, soma tudo', () => {
    expect(amostras([{ type: 'video' }])[0]).toBeGreaterThan(0);
    const texto = estimarConsumo([{ type: 'text', text: 'x'.repeat(170) }], () => 0.5);
    expect(texto).toBeCloseTo(10, 0);
    const soma = estimarConsumo(
      [
        { type: 'text', text: 'x'.repeat(170) },
        { type: 'text', text: 'x'.repeat(170) },
      ],
      () => 0.5,
    );
    expect(soma).toBeCloseTo(20, 0);
    expect(estimarConsumo([], () => 0.5)).toBe(0);
  });
});

describe('calcularLatencia — piso de consumo e tempo humano', () => {
  const amostrar = (e: EntradaLatencia, n = 1000, seed = 21) => {
    const rng = seeded(seed);
    return Array.from({ length: n }, () => calcularLatencia(e, rng).esperaAteDigitar_s).sort(
      (a, b) => a - b,
    );
  };

  it('vídeo longo vira piso da espera, limitado ao teto de 4 min', () => {
    const xs = amostrar({ ...base, gapDesdeCliente_s: 20, consumo_s: 300 });
    expect(xs[0]).toBeGreaterThanOrEqual(LATENCIA.pisoTeto_s - 1);
    expect(xs[xs.length - 1]).toBeLessThanOrEqual(LATENCIA.ativaMax_s);
  });

  it('consumo já coberto pelo tempo desde a mensagem não atrasa nada', () => {
    const rng = () => 0.5;
    const sem = calcularLatencia({ ...base, gapDesdeCliente_s: 400 }, rng).esperaAteDigitar_s;
    const com = calcularLatencia({ ...base, gapDesdeCliente_s: 400, consumo_s: 300 }, rng);
    expect(com.esperaAteDigitar_s).toBe(sem);
  });

  it('tempo humano de ~20 min (corrigir bug): espera de 1,5 a 4 min, variando', () => {
    const xs = amostrar({ ...base, tempoHumano_s: 1200 });
    const med = xs[500]!;
    expect(med).toBeGreaterThanOrEqual(110);
    expect(med).toBeLessThanOrEqual(180);
    expect(xs[xs.length - 1]).toBeLessThanOrEqual(LATENCIA.pisoTeto_s);
    expect(new Set(xs).size).toBeGreaterThan(500);
  });

  it('tempo que o agente gastou trabalhando desconta do tempo humano', () => {
    const rng = () => 0.5;
    const semTrabalho = calcularLatencia({ ...base, tempoHumano_s: 1200 }, rng).esperaAteDigitar_s;
    const trabalhou = calcularLatencia(
      { ...base, tempoHumano_s: 1200, decorrido_s: 600 },
      rng,
    ).esperaAteDigitar_s;
    expect(trabalhou).toBeLessThan(semTrabalho);
    expect(trabalhou).toBe(calcularLatencia({ ...base, decorrido_s: 600 }, rng).esperaAteDigitar_s);
  });

  it('resposta curta (tempo humano de segundos) fica como hoje', () => {
    const hoje = amostrar(base);
    const curta = amostrar({ ...base, tempoHumano_s: 5 });
    expect(curta[500]!).toBeLessThanOrEqual(hoje[500]! + 3);
  });

  it("'agora' continua 5 s, mas não pula o tempo de assistir um vídeo longo", () => {
    const rng = seeded(4);
    const ok = calcularLatencia({ ...base, urgencia: 'agora', tempoHumano_s: 1200 }, rng);
    expect(ok.esperaAteDigitar_s).toBe(LATENCIA.janelaCancelamento_s);
    const video = calcularLatencia({ ...base, urgencia: 'agora', consumo_s: 300 }, rng);
    expect(video.regime).toBe('agora');
    expect(video.esperaAteDigitar_s).toBe(LATENCIA.pisoTeto_s);
    expect(video.esperaAteLer_s).toBe(0);
  });

  it('o visto sai antes do tempo de consumo, e a latência máxima do chat ainda manda', () => {
    const s = calcularLatencia({ ...base, consumo_s: 200 }, () => 0.5);
    expect(s.esperaAteDigitar_s - s.esperaAteLer_s).toBeGreaterThanOrEqual(175);
    const teto = calcularLatencia({ ...base, consumo_s: 300, latenciaMaxima_s: 60 }, () => 0.5);
    expect(teto.esperaAteDigitar_s).toBeLessThanOrEqual(60);
  });
});
