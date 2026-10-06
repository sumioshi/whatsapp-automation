import { describe, expect, it } from 'vitest';
import { nomeSeguro } from './nome-arquivo';

describe('nomeSeguro', () => {
  it('tira diretórios, pontos iniciais e controle', () => {
    expect(nomeSeguro('a/../../x.json', 'f')).toBe('x.json');
    expect(nomeSeguro('..\\..\\y.pdf', 'f')).toBe('y.pdf');
    expect(nomeSeguro('.oculto', 'f')).toBe('oculto');
    expect(nomeSeguro('a\u0000b.txt', 'f')).toBe('ab.txt');
  });
  it('cai no fallback quando nada sobra', () => {
    expect(nomeSeguro('', 'f')).toBe('f');
    expect(nomeSeguro(null, 'f')).toBe('f');
    expect(nomeSeguro('../', 'f')).toBe('f');
  });
  it('limita a 120 e preserva nome normal', () => {
    expect(nomeSeguro('a'.repeat(200), 'f')).toHaveLength(120);
    expect(nomeSeguro('nota fiscal.pdf', 'f')).toBe('nota fiscal.pdf');
  });
});
