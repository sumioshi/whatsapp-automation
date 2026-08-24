import { describe, expect, it } from 'vitest';
import { sessionToken, verifySession } from './session';

describe('sessão do painel (cookie assinado)', () => {
  it('token é determinístico para as mesmas credenciais', async () => {
    const a = await sessionToken('dono', 'senha-forte');
    const b = await sessionToken('dono', 'senha-forte');
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });

  it('verifySession aceita o token emitido e rejeita token errado', async () => {
    const token = await sessionToken('dono', 'senha-forte');
    expect(await verifySession(token, 'dono', 'senha-forte')).toBe(true);
    expect(await verifySession('token-inventado', 'dono', 'senha-forte')).toBe(false);
    expect(await verifySession('', 'dono', 'senha-forte')).toBe(false);
  });

  it('trocar a senha revoga o token antigo', async () => {
    const antigo = await sessionToken('dono', 'senha-velha');
    expect(await verifySession(antigo, 'dono', 'senha-nova')).toBe(false);
  });

  it('usuário diferente gera token diferente', async () => {
    const a = await sessionToken('dono', 'x');
    const b = await sessionToken('gilberto', 'x');
    expect(a).not.toBe(b);
  });
});
