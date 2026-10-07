import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chaveDeSessao } from '../equipe/sessao';
import { ErroAgenda } from './evento';

export const ESCOPO_AGENDAS = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
export const ESCOPO_EVENTOS = 'https://www.googleapis.com/auth/calendar.events';
export const ESCOPOS = ['openid', 'email', ESCOPO_AGENDAS, ESCOPO_EVENTOS];
export const STATE_COOKIE = 'wac_google_state';
export const STATE_VALIDADE_S = 600;
export const CAMINHO_CALLBACK = '/api/google/callback';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };

export interface ConfigOAuth {
  clientId: string;
  clientSecret: string;
}

export function configOAuth(env: Partial<NodeJS.ProcessEnv> = process.env): ConfigOAuth | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * Origem pública do painel. Atrás do proxy da hospedagem o `req.url` é interno;
 * vale `PUBLIC_URL` se definida, senão os cabeçalhos encaminhados.
 */
export function origemPublica(headers: Headers, env: Partial<NodeJS.ProcessEnv> = process.env): string {
  if (env.PUBLIC_URL) return env.PUBLIC_URL.replace(/\/+$/, '');
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? 'localhost:3000').split(',')[0]!.trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || (local ? 'http' : 'https');
  return `${proto}://${host}`;
}

let chaveLocal: string | null = null;

/** Chave do `state`: a mesma das sessões do painel; sem senha (dev local), uma aleatória por processo. */
function chaveDoState(): string {
  const chave = chaveDeSessao();
  if (chave) return chave;
  chaveLocal ??= randomBytes(32).toString('hex');
  return chaveLocal;
}

function assinar(corpo: string, chave: string): string {
  return createHmac('sha256', chave).update(`google-state.${corpo}`).digest('base64url');
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** `nonce.validade.assinatura`; vai na URL do Google e num cookie curto. */
export function novoState(agoraS = Math.floor(Date.now() / 1000), chave = chaveDoState()): string {
  const corpo = `${randomBytes(16).toString('base64url')}.${agoraS + STATE_VALIDADE_S}`;
  return `${corpo}.${assinar(corpo, chave)}`;
}

/** O `state` que voltou do Google tem que ser o do cookie, assinado e dentro da validade. */
export function stateValido(
  state: string | null,
  cookie: string | undefined,
  agoraS = Math.floor(Date.now() / 1000),
  chave = chaveDoState(),
): boolean {
  if (!state || !cookie || !iguais(state, cookie)) return false;
  const partes = state.split('.');
  if (partes.length !== 3) return false;
  const [nonce, exp, sig] = partes as [string, string, string];
  if (!iguais(assinar(`${nonce}.${exp}`, chave), sig)) return false;
  return Number(exp) >= agoraS;
}

export function urlDeAutorizacao(cfg: ConfigOAuth, redirect: string, state: string): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: ESCOPOS.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${q}`;
}

export interface TokensGoogle {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

async function postToken(params: Record<string, string>): Promise<TokensGoogle> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ErroAgenda('google_indisponivel');
  }
  const corpo = (await res.json().catch(() => ({}))) as Partial<TokensGoogle> & { error?: string };
  if (!res.ok || typeof corpo.access_token !== 'string') {
    if (corpo.error === 'invalid_grant') throw new ErroAgenda('desconectado');
    throw new ErroAgenda('google_indisponivel');
  }
  return {
    access_token: corpo.access_token,
    expires_in: Number(corpo.expires_in ?? 3600),
    ...(corpo.refresh_token ? { refresh_token: corpo.refresh_token } : {}),
    ...(corpo.id_token ? { id_token: corpo.id_token } : {}),
    ...(corpo.scope ? { scope: corpo.scope } : {}),
  };
}

export function trocarCodigo(cfg: ConfigOAuth, redirect: string, code: string): Promise<TokensGoogle> {
  return postToken({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirect,
    grant_type: 'authorization_code',
  });
}

export function renovar(cfg: ConfigOAuth, refreshToken: string): Promise<TokensGoogle> {
  return postToken({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
  });
}

export async function revogar(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Desconectar no painel vale mesmo se o Google não responder.
  }
}

/** E-mail da conta, lido do `id_token` que veio direto do Google por TLS. */
export function emailDoIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const p = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: unknown };
    return typeof p.email === 'string' ? p.email : null;
  } catch {
    return null;
  }
}

/** A tela do Google deixa desmarcar permissões: sem as duas da agenda, a conexão não serve. */
export function escoposSuficientes(scope?: string): boolean {
  const lista = (scope ?? '').split(' ');
  return lista.includes(ESCOPO_AGENDAS) && lista.includes(ESCOPO_EVENTOS);
}
