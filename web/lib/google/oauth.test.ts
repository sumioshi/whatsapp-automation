import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ESCOPOS,
  configOAuth,
  emailDoIdToken,
  escoposSuficientes,
  novoState,
  origemPublica,
  renovar,
  stateValido,
  urlDeAutorizacao,
} from './oauth';
import { apagarToken, gravarToken, lerToken } from './token-store';

afterEach(() => vi.restoreAllMocks());

const CHAVE = 'chave-de-teste';
const CFG = { clientId: 'cid', clientSecret: 'cs' };

describe('state', () => {
  it('aceita o próprio state com o cookie igual', () => {
    const s = novoState(1000, CHAVE);
    expect(stateValido(s, s, 1000, CHAVE)).toBe(true);
  });
  it('recusa cookie diferente, validade adulterada, vencido, outra chave e ausente', () => {
    const s = novoState(1000, CHAVE);
    expect(stateValido(s, novoState(1000, CHAVE), 1000, CHAVE)).toBe(false);
    const [nonce, exp, sig] = s.split('.');
    const adulterado = `${nonce}.${Number(exp) + 100}.${sig}`;
    expect(stateValido(adulterado, adulterado, 1000, CHAVE)).toBe(false);
    expect(stateValido(s, s, 1000 + 601, CHAVE)).toBe(false);
    expect(stateValido(s, s, 1000, 'outra')).toBe(false);
    expect(stateValido(null, s, 1000, CHAVE)).toBe(false);
    expect(stateValido(s, undefined, 1000, CHAVE)).toBe(false);
  });
});

describe('URL, origem e config', () => {
  it('URL pede offline, consentimento e os escopos', () => {
    const u = new URL(urlDeAutorizacao(CFG, 'https://painel.exemplo/api/google/callback', 'st'));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: 'cid',
      redirect_uri: 'https://painel.exemplo/api/google/callback',
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      state: 'st',
      scope: ESCOPOS.join(' '),
    });
  });
  it('origem pelo proxy; localhost em http; PUBLIC_URL manda', () => {
    expect(
      origemPublica(
        new Headers({ 'x-forwarded-host': 'painel.exemplo', 'x-forwarded-proto': 'https', host: 'interno:8080' }),
        {},
      ),
    ).toBe('https://painel.exemplo');
    expect(origemPublica(new Headers({ host: 'localhost:3000' }), {})).toBe('http://localhost:3000');
    expect(origemPublica(new Headers({ host: 'x' }), { PUBLIC_URL: 'https://fixo.exemplo/' })).toBe(
      'https://fixo.exemplo',
    );
  });
  it('configOAuth exige id e segredo', () => {
    expect(configOAuth({ GOOGLE_CLIENT_ID: 'a' })).toBeNull();
    expect(configOAuth({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' })).toEqual({ clientId: 'a', clientSecret: 'b' });
  });
  it('escopos: precisa dos dois da agenda', () => {
    expect(escoposSuficientes(ESCOPOS.join(' '))).toBe(true);
    expect(escoposSuficientes('openid email https://www.googleapis.com/auth/calendar.calendarlist.readonly')).toBe(false);
    expect(escoposSuficientes(undefined)).toBe(false);
  });
});

describe('token do Google', () => {
  it('invalid_grant vira desconectado', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
    );
    await expect(renovar(CFG, 'rt')).rejects.toMatchObject({ codigo: 'desconectado' });
  });
  it('5xx e rede fora viram indisponível', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('x', { status: 503 }))
      .mockRejectedValueOnce(new Error('rede'));
    await expect(renovar(CFG, 'rt')).rejects.toMatchObject({ codigo: 'google_indisponivel' });
    await expect(renovar(CFG, 'rt')).rejects.toMatchObject({ codigo: 'google_indisponivel' });
  });
  it('renovação manda o refresh_token e devolve o access', async () => {
    const f = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ access_token: 'at', expires_in: 3599 }), { status: 200 }));
    expect(await renovar(CFG, 'rt')).toMatchObject({ access_token: 'at', expires_in: 3599 });
    const corpo = new URLSearchParams(String(f.mock.calls[0]![1]!.body));
    expect([corpo.get('grant_type'), corpo.get('refresh_token'), corpo.get('client_id')]).toEqual([
      'refresh_token',
      'rt',
      'cid',
    ]);
  });
  it('e-mail do id_token', () => {
    const payload = Buffer.from(JSON.stringify({ email: 'eu@exemplo.com' })).toString('base64url');
    expect(emailDoIdToken(`h.${payload}.s`)).toBe('eu@exemplo.com');
    expect(emailDoIdToken('lixo')).toBeNull();
    expect(emailDoIdToken(undefined)).toBeNull();
  });
});

describe('token-store', () => {
  it('grava com permissão 0600, lê e apaga', async () => {
    const arq = join(await mkdtemp(join(tmpdir(), 'wac-google-')), '.google', 'token.json');
    expect(await lerToken(arq)).toBeNull();
    const t = { refresh_token: 'rt', access_token: 'at', expira_em: 1, email: null, escopos: ['x'] };
    await gravarToken(t, arq);
    expect((await stat(arq)).mode & 0o777).toBe(0o600);
    expect(await lerToken(arq)).toEqual(t);
    await apagarToken(arq);
    expect(await lerToken(arq)).toBeNull();
  });
  it('arquivo sem refresh_token conta como desconectado', async () => {
    const arq = join(await mkdtemp(join(tmpdir(), 'wac-google-')), '.google', 'token.json');
    await mkdir(dirname(arq), { recursive: true });
    await writeFile(arq, JSON.stringify({ access_token: 'x' }));
    expect(await lerToken(arq)).toBeNull();
  });
});
