import { describe, expect, it } from 'vitest';
import { PERFIL_DEFAULT } from './baloes';
import {
  CPS_PADRAO,
  duracaoPlano,
  injetarTypo,
  type Passo,
  planoDeEntrega,
  TETO_SEGURANCA_MS,
} from './plano';

function seeded(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}
type Enviar = Extract<Passo, { tipo: 'enviar' }>;
type Digitando = Extract<Passo, { tipo: 'digitando' }>;
const envios = (p: Passo[]) => p.filter((x): x is Enviar => x.tipo === 'enviar');
const digitando = (p: Passo[]) => p.filter((x): x is Digitando => x.tipo === 'digitando');
const somaDigitando = (p: Passo[]) => digitando(p).reduce((s, d) => s + d.ms, 0);

describe('planoDeEntrega v2', () => {
  it('sem passo visto; pausa de leitura → digitando → enviar por balão, pausa entre balões', () => {
    const plano = planoDeEntrega(['oi', 'tudo certo por aqui'], PERFIL_DEFAULT, {
      rng: seeded(42),
    });
    expect(plano.some((p) => (p as { tipo: string }).tipo === 'visto')).toBe(false);
    expect(plano[0]?.tipo).toBe('pausa');
    expect(envios(plano).map((e) => e.texto)).toEqual(['oi', 'tudo certo por aqui']);
    const tipos = plano.map((p) => p.tipo);
    expect(tipos.slice(tipos.indexOf('enviar') + 1, tipos.lastIndexOf('enviar'))).toContain(
      'pausa',
    );
  });

  it('digita na velocidade do perfil (chars/s), com jitter; default 3,0', () => {
    const rng = () => 0.5;
    const texto = 'x'.repeat(90);
    expect(somaDigitando(planoDeEntrega([texto], PERFIL_DEFAULT, { rng }))).toBeCloseTo(
      (90 / CPS_PADRAO) * 1000,
      -2,
    );
    expect(
      somaDigitando(planoDeEntrega([texto], { ...PERFIL_DEFAULT, charsPorSegundo: 5 }, { rng })),
    ).toBeCloseTo(18_000, -2);
    expect(
      somaDigitando(planoDeEntrega([texto], { ...PERFIL_DEFAULT, charsPorSegundo: 0.5 }, { rng })),
    ).toBeCloseTo(50_000, -2);
  });

  it('pausa de pensar: balão longo com rng favorável ganha pausas curtas no meio da digitação', () => {
    const rng = () => 0.1;
    const plano = planoDeEntrega(['y'.repeat(200)], PERFIL_DEFAULT, { rng });
    const idxEnvio = plano.findIndex((p) => p.tipo === 'enviar');
    const meio = plano.slice(1, idxEnvio);
    const pausas = meio.filter((p): p is Extract<Passo, { tipo: 'pausa' }> => p.tipo === 'pausa');
    expect(pausas.length).toBeGreaterThanOrEqual(4);
    for (const p of pausas) {
      expect(p.ms).toBeGreaterThanOrEqual(800);
      expect(p.ms).toBeLessThanOrEqual(3500);
    }
  });

  it('pausa entre balões usa o perfil quando existe', () => {
    const rng = () => 0.5;
    const plano = planoDeEntrega(
      ['um', 'dois'],
      { ...PERFIL_DEFAULT, pausaEntreBaloes_s: 6 },
      { rng },
    );
    const idx1 = plano.findIndex((p) => p.tipo === 'enviar');
    const entre = plano.slice(idx1 + 1).find((p) => p.tipo === 'pausa') as { ms: number };
    expect(entre.ms).toBeCloseTo(6000, -2);
  });

  it('pausa de leitura cresce com o tamanho da msg recebida (30 ms/char, teto 6 s)', () => {
    const rng = () => 0.5;
    const curta = (
      planoDeEntrega(['ok'], PERFIL_DEFAULT, { rng, msgRecebidaChars: 10 })[0] as { ms: number }
    ).ms;
    const longa = (
      planoDeEntrega(['ok'], PERFIL_DEFAULT, { rng, msgRecebidaChars: 400 })[0] as { ms: number }
    ).ms;
    expect(longa).toBeGreaterThan(curta);
    expect(longa - curta).toBeLessThanOrEqual(6000);
  });

  it('typos ligado: balão com ≥ 4 palavras pode sair errado e a correção vem como balão "*palavra" 2–5 s depois', () => {
    const rng = () => 0.001;
    const plano = planoDeEntrega(['mensagem grande o suficiente pra typo'], PERFIL_DEFAULT, {
      typos: true,
      rng,
    });
    const e = envios(plano);
    expect(e).toHaveLength(2);
    expect(e[0]?.texto).not.toBe('mensagem grande o suficiente pra typo');
    expect(e[1]?.texto.startsWith('*')).toBe(true);
    const entre = plano.slice(plano.indexOf(e[0] as Passo) + 1, plano.indexOf(e[1] as Passo));
    const pausa = entre.find((p) => p.tipo === 'pausa') as { ms: number };
    expect(pausa.ms).toBeGreaterThanOrEqual(2000);
    expect(pausa.ms).toBeLessThanOrEqual(5000);
    expect(
      envios(planoDeEntrega(['oi tudo bem'], PERFIL_DEFAULT, { typos: true, rng })),
    ).toHaveLength(1);
    expect(
      envios(planoDeEntrega(['mensagem grande o suficiente pra typo'], PERFIL_DEFAULT, { rng })),
    ).toHaveLength(1);
  });

  it('citar vai só no primeiro balão', () => {
    const plano = planoDeEntrega(['a', 'b'], PERFIL_DEFAULT, { rng: seeded(1), citar: 'MSG1' });
    expect(envios(plano).map((e) => e.citar)).toEqual(['MSG1', undefined]);
  });

  it('teto de segurança de 6 min escala o plano', () => {
    const plano = planoDeEntrega(
      Array.from({ length: 8 }, () => 'z'.repeat(400)),
      { ...PERFIL_DEFAULT, charsPorSegundo: 1.8 },
      { rng: seeded(3) },
    );
    expect(duracaoPlano(plano)).toBeLessThanOrEqual(TETO_SEGURANCA_MS);
  });

  it('balões vazios são descartados', () => {
    expect(
      envios(planoDeEntrega(['', '  ', 'ok'], PERFIL_DEFAULT, { rng: seeded(1) })),
    ).toHaveLength(1);
  });
});

describe('injetarTypo', () => {
  it('troca duas letras adjacentes numa palavra ≥ 4 letras e devolve a palavra certa', () => {
    const r = injetarTypo('quero saber do prazo', () => 0.5);
    expect(r).not.toBeNull();
    expect(r?.texto).not.toBe('quero saber do prazo');
    expect(r?.texto.split(' ')).toHaveLength(4);
    expect('quero saber do prazo'.split(' ')).toContain(r?.correta);
  });
  it('sem palavra elegível → null', () => {
    expect(injetarTypo('oi ok', () => 0.5)).toBeNull();
  });
});
