import { describe, expect, it } from 'vitest';
import { config } from '../proxy';

/** O proxy só roda nos caminhos que casam com o matcher; fora dele a rota é pública. */
const passaPeloProxy = (caminho: string) => new RegExp(`^${config.matcher[0]}$`).test(caminho);

describe('rotas públicas do proxy', () => {
  it('política de privacidade abre sem login (o Google exige link público)', () => {
    expect(passaPeloProxy('/privacidade')).toBe(false);
  });
  it('prefixo parecido continua protegido', () => {
    expect(passaPeloProxy('/privacidadex')).toBe(true);
    expect(passaPeloProxy('/privacidade/x')).toBe(true);
    expect(passaPeloProxy('/agenda')).toBe(true);
    expect(passaPeloProxy('/login')).toBe(false);
  });
});
