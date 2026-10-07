import { describe, expect, it } from 'vitest';
import { gerarSenha, hashSenha, verificarSenha } from './senha';

describe('senha', () => {
  it('hash confere com a senha certa e não com outra', async () => {
    const h = await hashSenha('segredo-123');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(h).not.toContain('segredo-123');
    expect(await verificarSenha('segredo-123', h)).toBe(true);
    expect(await verificarSenha('segredo-124', h)).toBe(false);
  });
  it('mesmo texto gera hash diferente (sal)', async () => {
    expect(await hashSenha('abcdefgh')).not.toBe(await hashSenha('abcdefgh'));
  });
  it('formato estranho é falso, nunca exceção', async () => {
    expect(await verificarSenha('x', 'md5$abc')).toBe(false);
    expect(await verificarSenha('x', '')).toBe(false);
  });
  it('senha gerada tem 16 caracteres seguros pra digitar', () => {
    const s = gerarSenha();
    expect(s).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(gerarSenha()).not.toBe(s);
  });
});
