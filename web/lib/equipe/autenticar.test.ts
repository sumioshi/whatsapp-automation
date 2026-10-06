import { describe, expect, it } from 'vitest';
import { cookieDe, credenciaisDoDono, donoPorBasic, igualSeguro, quemPelaSessao } from './autenticar';
import { assinarSessao, novaSessao } from './sessao';
import type { Usuario } from './usuarios';

const cred = { user: 'operador', pass: 'senha-do-dono' };
const CHAVE = 'k';
const AGORA = 1_800_000_000;
const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;
const ana: Usuario = {
  login: 'ana', nome: 'Ana', senha: 'scrypt$a$b', ativo: true, versao: 2,
  chats: [], criadoEm: '2026-10-06T00:00:00.000Z', ultimoAcesso: null,
};
const achar = async (login: string) => (login === 'ana' ? ana : null);

describe('dono por Basic', () => {
  it('confere usuário e senha', () => {
    expect(donoPorBasic(basic('operador', 'senha-do-dono'), cred)).toBe(true);
    expect(donoPorBasic(basic('operador', 'errada'), cred)).toBe(false);
    expect(donoPorBasic(basic('ana', 'senha-do-dono'), cred)).toBe(false);
    expect(donoPorBasic('Bearer x', cred)).toBe(false);
    expect(donoPorBasic(null, cred)).toBe(false);
  });
  it('igualSeguro compara conteúdo, inclusive tamanhos diferentes', () => {
    expect(igualSeguro('abc', 'abc')).toBe(true);
    expect(igualSeguro('abc', 'abcd')).toBe(false);
  });
});

describe('quemPelaSessao', () => {
  const tok = (login: string, papel: 'dono' | 'atendente', v: number) =>
    assinarSessao(novaSessao(login, papel, v, AGORA), CHAVE);

  it('dono: login tem que ser o PANEL_USER', async () => {
    expect(await quemPelaSessao(tok('operador', 'dono', 0), cred, achar, CHAVE, AGORA)).toEqual({ papel: 'dono', login: 'operador' });
    expect(await quemPelaSessao(tok('ana', 'dono', 0), cred, achar, CHAVE, AGORA)).toBeNull();
  });
  it('atendente ativo com a versão atual entra', async () => {
    expect(await quemPelaSessao(tok('ana', 'atendente', 2), cred, achar, CHAVE, AGORA)).toEqual({ papel: 'atendente', login: 'ana' });
  });
  it('versão antiga, conta desativada ou apagada → null', async () => {
    expect(await quemPelaSessao(tok('ana', 'atendente', 1), cred, achar, CHAVE, AGORA)).toBeNull();
    const desativada = async () => ({ ...ana, ativo: false });
    expect(await quemPelaSessao(tok('ana', 'atendente', 2), cred, desativada, CHAVE, AGORA)).toBeNull();
    expect(await quemPelaSessao(tok('bia', 'atendente', 2), cred, achar, CHAVE, AGORA)).toBeNull();
  });
  it('sem cookie → null', async () => {
    expect(await quemPelaSessao(undefined, cred, achar, CHAVE, AGORA)).toBeNull();
  });
});

describe('utilitários', () => {
  it('credenciaisDoDono exige as duas variáveis', () => {
    expect(credenciaisDoDono({ PANEL_USER: 'u', PANEL_PASS: 'p' })).toEqual({ user: 'u', pass: 'p' });
    expect(credenciaisDoDono({ PANEL_USER: 'u' })).toBeNull();
  });
  it('cookieDe acha o valor pelo nome', () => {
    expect(cookieDe('a=1; wac_session=v2.x.y; b=2', 'wac_session')).toBe('v2.x.y');
    expect(cookieDe('a=1', 'wac_session')).toBeUndefined();
    expect(cookieDe(null, 'wac_session')).toBeUndefined();
  });
});
