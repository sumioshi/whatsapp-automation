import { describe, expect, it } from 'vitest';
import { config } from '../proxy';
import { CLASSIFICACAO } from './classificacao-rotas';

/** O proxy só roda nos caminhos que casam com o matcher; fora dele a rota é pública. */
const passaPeloProxy = (caminho: string) => new RegExp(`^${config.matcher[0]}$`).test(caminho);

describe('rotas públicas do proxy', () => {
  it('política de privacidade e landing abrem sem login', () => {
    expect(passaPeloProxy('/privacidade')).toBe(false);
    expect(passaPeloProxy('/landing')).toBe(false);
    expect(passaPeloProxy('/landing-assets/unicornStudio.umd-f86b9c4a.js')).toBe(false);
  });
  it('prefixo parecido continua protegido', () => {
    expect(passaPeloProxy('/privacidadex')).toBe(true);
    expect(passaPeloProxy('/privacidade/x')).toBe(true);
    expect(passaPeloProxy('/landingx')).toBe(true);
    expect(passaPeloProxy('/agenda')).toBe(true);
    expect(passaPeloProxy('/login')).toBe(false);
  });
  it('entrar com Google e com código abrem sem sessão (é por elas que a sessão nasce)', () => {
    expect(passaPeloProxy('/api/login')).toBe(false);
    expect(passaPeloProxy('/api/login/google')).toBe(false);
    expect(passaPeloProxy('/api/login/google/callback')).toBe(false);
    expect(passaPeloProxy('/api/login/codigo')).toBe(false);
    expect(passaPeloProxy('/api/login/codigo/verificar')).toBe(false);
    expect(passaPeloProxy('/api/loginx')).toBe(true);
    expect(passaPeloProxy('/api/logins/google')).toBe(true);
  });
  it('tudo sob /api/login é público de propósito: rota nova ali não nasce aberta sem querer', () => {
    const sob = Object.keys(CLASSIFICACAO).filter((f) => f.startsWith('api/login/') || f === 'api/login/route.ts');
    expect(sob.length).toBeGreaterThan(0);
    for (const f of sob) expect([f, CLASSIFICACAO[f]]).toEqual([f, 'publico']);
  });
});
