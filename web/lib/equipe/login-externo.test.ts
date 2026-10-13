import { describe, expect, it } from 'vitest';
import { emailsDoDono, ehEmailDoDono, emailValido } from './login-externo';

describe('emailsDoDono', () => {
  it('lê a lista separada por vírgula ou espaço, em minúsculas', () => {
    expect(emailsDoDono({ PANEL_OWNER_EMAILS: ' Dono@Exemplo.com, outro@exemplo.com  terceiro@x.io ' })).toEqual([
      'dono@exemplo.com',
      'outro@exemplo.com',
      'terceiro@x.io',
    ]);
  });
  it('sem a variável ou com lixo, ninguém entra por e-mail', () => {
    expect(emailsDoDono({})).toEqual([]);
    expect(emailsDoDono({ PANEL_OWNER_EMAILS: ' , nao-e-email ' })).toEqual([]);
  });
});

describe('ehEmailDoDono', () => {
  const env = { PANEL_OWNER_EMAILS: 'dono@exemplo.com' };
  it('compara sem diferenciar maiúsculas e espaços', () => {
    expect(ehEmailDoDono(' DONO@exemplo.com ', env)).toBe(true);
    expect(ehEmailDoDono('dono@exemplo.com.br', env)).toBe(false);
    expect(ehEmailDoDono('', env)).toBe(false);
  });
});

describe('emailValido', () => {
  it('aceita endereço comum e recusa o resto', () => {
    expect(emailValido('a.b+c@d.co')).toBe(true);
    expect(emailValido('sem-arroba')).toBe(false);
    expect(emailValido('a@b')).toBe(false);
    expect(emailValido(`${'x'.repeat(250)}@a.com`)).toBe(false);
  });
});
