import { describe, expect, it } from 'vitest';
import { PERFIL_DEFAULT } from './baloes';
import { injetarTypo, planoDeEntrega, TETO_MS } from './plano';

/** RNG determinístico simples (LCG) pra teste. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

describe('planoDeEntrega', () => {
  it('estrutura: visto → pausa de leitura → [digitando → enviar] por balão, com pausa entre balões', () => {
    const plano = planoDeEntrega(['oi', 'tudo certo por aqui'], PERFIL_DEFAULT, { rng: seeded(42) });
    const tipos = plano.map((p) => p.tipo);
    expect(tipos[0]).toBe('visto');
    expect(tipos[1]).toBe('pausa');
    expect(tipos).toContain('digitando');
    expect(plano.filter((p) => p.tipo === 'enviar').map((p) => (p as { texto: string }).texto)).toEqual([
      'oi',
      'tudo certo por aqui',
    ]);
    // entre os dois envios existe uma pausa (humano não emenda balões em 0ms)
    const idx1 = tipos.indexOf('enviar');
    const idx2 = tipos.lastIndexOf('enviar');
    expect(tipos.slice(idx1 + 1, idx2)).toContain('pausa');
  });

  it('digitando é proporcional ao tamanho do balão (40-80ms/char)', () => {
    const [curto] = planoDeEntrega(['oi'], PERFIL_DEFAULT, { rng: seeded(1) }).filter((p) => p.tipo === 'digitando');
    const [longo] = planoDeEntrega(['a'.repeat(200)], PERFIL_DEFAULT, { rng: seeded(1) }).filter(
      (p) => p.tipo === 'digitando',
    );
    expect((longo as { ms: number }).ms).toBeGreaterThan((curto as { ms: number }).ms);
    expect((longo as { ms: number }).ms).toBeGreaterThanOrEqual(200 * 40 * 0.5); // com teto pode escalar pra baixo
  });

  it('respeita o TETO_MS mesmo com 3 balões gigantes', () => {
    const plano = planoDeEntrega(['a'.repeat(500), 'b'.repeat(500), 'c'.repeat(500)], PERFIL_DEFAULT, {
      rng: seeded(7),
      foraDoExpediente: true,
    });
    const total = plano.reduce((acc, p) => acc + ('ms' in p ? p.ms : 0), 0);
    expect(total).toBeLessThanOrEqual(TETO_MS);
  });

  it('typos: com opt-in e rng favorável, um enviar ganha typoAntes; sem opt-in, nunca', () => {
    const rngSempre = () => 0.001; // qualquer limiar passa
    const com = planoDeEntrega(['mensagem grande o suficiente pra typo'], PERFIL_DEFAULT, { typos: true, rng: rngSempre });
    const enviar = com.find((p) => p.tipo === 'enviar') as { texto: string; typoAntes?: string };
    expect(enviar.typoAntes).toBeDefined();
    expect(enviar.typoAntes).not.toBe(enviar.texto);
    const sem = planoDeEntrega(['mensagem grande o suficiente pra typo'], PERFIL_DEFAULT, { typos: false, rng: rngSempre });
    expect((sem.find((p) => p.tipo === 'enviar') as { typoAntes?: string }).typoAntes).toBeUndefined();
  });

  it('teto vale pra QUALQUER seed (propriedade: 200 seeds, cenário realista fora do expediente)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const plano = planoDeEntrega(
        ['a'.repeat(300), 'b'.repeat(400), 'c'.repeat(500)],
        PERFIL_DEFAULT,
        { rng: seeded(seed), foraDoExpediente: true, msgRecebidaChars: 400 },
      );
      const total = plano.reduce((acc, p) => acc + ('ms' in p ? p.ms : 0), 0);
      expect(total).toBeLessThanOrEqual(TETO_MS);
    }
  });

  it('balões vazios são filtrados e digitando tem piso de 300ms (sem cap)', () => {
    const plano = planoDeEntrega(['', '   ', 'oi'], PERFIL_DEFAULT, { rng: seeded(5) });
    expect(plano.filter((p) => p.tipo === 'enviar')).toHaveLength(1);
    for (const d of plano.filter((p) => p.tipo === 'digitando')) {
      expect((d as { ms: number }).ms).toBeGreaterThanOrEqual(300);
    }
  });
});

describe('injetarTypo', () => {
  it('troca letras adjacentes numa palavra ≥4 chars e devolve texto diferente', () => {
    const r = injetarTypo('vou verificar o retorno agora', seeded(3));
    expect(r).not.toBeNull();
    expect(r).not.toBe('vou verificar o retorno agora');
    expect(r!.length).toBe('vou verificar o retorno agora'.length);
  });

  it('sem palavra elegível devolve null', () => {
    expect(injetarTypo('ok', seeded(3))).toBeNull();
  });
});
