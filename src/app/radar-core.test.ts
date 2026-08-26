import { describe, expect, it } from 'vitest';
import {
  calcularPendencias,
  deveEnviarDigest,
  type EntradaRadar,
  formatarDigest,
  hashPendencias,
  RADAR_DEFAULTS,
} from './radar-core.js';

const H = 60 * 60_000;
const AGORA = Date.parse('2026-08-26T18:00:00Z');
const CFG = { ...RADAR_DEFAULTS, ativo: true, prazoMinimoMin: 120 };

function entrada(over: Partial<EntradaRadar>): EntradaRadar {
  return {
    slug: 'acme',
    nome: 'Acme',
    ultimaMsg: { fromMe: false, timestampMs: AGORA - 4 * H },
    lastActivityMs: null,
    muted: false,
    ...over,
  };
}

describe('calcularPendencias', () => {
  it('cliente sem resposta acima do prazo vira pendência', () => {
    const p = calcularPendencias([entrada({})], AGORA, CFG);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ slug: 'acme', horas: 4 });
  });

  it('última mensagem MINHA não é pendência (já respondi)', () => {
    expect(
      calcularPendencias(
        [entrada({ ultimaMsg: { fromMe: true, timestampMs: AGORA - 4 * H } })],
        AGORA,
        CFG,
      ),
    ).toEqual([]);
  });

  it('abaixo do prazo mínimo não cobra ainda', () => {
    expect(
      calcularPendencias(
        [entrada({ ultimaMsg: { fromMe: false, timestampMs: AGORA - 1 * H } })],
        AGORA,
        CFG,
      ),
    ).toEqual([]);
  });

  it('silenciado e sem-mensagem ficam de fora', () => {
    expect(
      calcularPendencias([entrada({ muted: true }), entrada({ slug: 'b', ultimaMsg: null })], AGORA, CFG),
    ).toEqual([]);
  });

  it('data de corte descarta chat dormente (atividade anterior ao corte)', () => {
    const cfg = { ...CFG, dataCorte: '2026-08-01' };
    const dormente = entrada({
      slug: 'velho',
      ultimaMsg: { fromMe: false, timestampMs: Date.parse('2026-07-10T10:00:00Z') },
    });
    expect(calcularPendencias([dormente], AGORA, cfg)).toEqual([]);
    // lastActivity recente resgata mesmo com última msg antiga
    const vivo = entrada({
      slug: 'vivo',
      ultimaMsg: { fromMe: false, timestampMs: AGORA - 200 * H },
      lastActivityMs: AGORA - 3 * H,
    });
    expect(calcularPendencias([vivo], AGORA, cfg)).toHaveLength(1);
  });

  it('desligado devolve vazio e ordena por espera decrescente quando ligado', () => {
    expect(calcularPendencias([entrada({})], AGORA, { ...CFG, ativo: false })).toEqual([]);
    const p = calcularPendencias(
      [
        entrada({ slug: 'a', ultimaMsg: { fromMe: false, timestampMs: AGORA - 3 * H } }),
        entrada({ slug: 'b', ultimaMsg: { fromMe: false, timestampMs: AGORA - 9 * H } }),
      ],
      AGORA,
      CFG,
    );
    expect(p.map((x) => x.slug)).toEqual(['b', 'a']);
  });
});

describe('digest', () => {
  const pend = calcularPendencias([entrada({})], AGORA, CFG);

  it('hash é estável por conjunto de slugs (ordem não importa)', () => {
    const p2 = [...pend].reverse();
    expect(hashPendencias(pend)).toBe(hashPendencias(p2));
  });

  it('envia quando o conjunto muda e o cooldown passou; segura nos demais', () => {
    expect(deveEnviarDigest('h1', null, null, AGORA, 120)).toBe(true); // primeiro
    expect(deveEnviarDigest('h1', 'h1', AGORA - 3 * H, AGORA, 120)).toBe(false); // nada mudou
    expect(deveEnviarDigest('h2', 'h1', AGORA - 1 * H, AGORA, 120)).toBe(false); // mudou mas em cooldown
    expect(deveEnviarDigest('h2', 'h1', AGORA - 3 * H, AGORA, 120)).toBe(true); // mudou e passou
  });

  it('lista vazia nunca dispara digest', () => {
    expect(deveEnviarDigest('', 'h1', AGORA - 9 * H, AGORA, 120)).toBe(false);
  });

  it('formata compacto com h/d', () => {
    const p = [
      { slug: 'a', nome: 'Fulano', desdeIso: '', horas: 4 },
      { slug: 'b', nome: 'Acme', desdeIso: '', horas: 30 },
    ];
    expect(formatarDigest(p)).toBe('⏰ 2 aguardando resposta: Fulano (4h) · Acme (1d)');
  });

  it('lista longa é cortada em 8 nomes + "e mais N"', () => {
    const p = Array.from({ length: 12 }, (_, i) => ({
      slug: `s${i}`,
      nome: `Chat${i}`,
      desdeIso: '',
      horas: 5,
    }));
    const texto = formatarDigest(p);
    expect(texto).toContain('12 aguardando resposta');
    expect(texto).toContain('Chat7 (5h)');
    expect(texto).not.toContain('Chat8');
    expect(texto).toContain('… e mais 4');
  });
});
