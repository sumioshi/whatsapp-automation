import { describe, expect, it } from 'vitest';
import { assinarSessao, chaveDeSessao, lerSessao, novaSessao, VALIDADE_S } from './sessao';

const CHAVE = 'chave-de-teste';
const AGORA = 1_800_000_000;

describe('sessão v2', () => {
  it('ida e volta', () => {
    const s = novaSessao('ana', 'atendente', 3, AGORA);
    expect(s).toEqual({ u: 'ana', p: 'atendente', v: 3, exp: AGORA + VALIDADE_S.atendente });
    const t = assinarSessao(s, CHAVE);
    expect(t.startsWith('v2.')).toBe(true);
    expect(lerSessao(t, CHAVE, AGORA + 10)).toEqual(s);
  });
  it('validade: dono 30 dias, atendente 7', () => {
    expect(VALIDADE_S.dono).toBe(30 * 86400);
    expect(VALIDADE_S.atendente).toBe(7 * 86400);
  });
  it('vencida, chave errada, adulterada ou formato antigo → null', () => {
    const t = assinarSessao(novaSessao('ana', 'atendente', 1, AGORA), CHAVE);
    expect(lerSessao(t, CHAVE, AGORA + VALIDADE_S.atendente + 1)).toBeNull();
    expect(lerSessao(t, 'outra', AGORA)).toBeNull();
    const [v, payload, sig] = t.split('.') as [string, string, string];
    const outro = Buffer.from(JSON.stringify({ u: 'ana', p: 'dono', v: 1, exp: AGORA + 99 })).toString('base64url');
    expect(lerSessao(`${v}.${outro}.${sig}`, CHAVE, AGORA)).toBeNull();
    expect(lerSessao(`${v}.${payload}`, CHAVE, AGORA)).toBeNull();
    expect(lerSessao('tokenAntigoV1semPontos', CHAVE, AGORA)).toBeNull();
    expect(lerSessao('', CHAVE, AGORA)).toBeNull();
  });
  it('chave: segredo próprio vence; senão deriva da senha do dono; sem nada → null', () => {
    expect(chaveDeSessao({ PANEL_SESSION_SECRET: 's', PANEL_PASS: 'p' })).toBe('s');
    expect(chaveDeSessao({ PANEL_PASS: 'p' })).toBe('wac-sessao-v2:p');
    expect(chaveDeSessao({})).toBeNull();
  });
});
