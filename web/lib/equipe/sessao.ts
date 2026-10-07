import { createHmac, timingSafeEqual } from 'node:crypto';

export type Papel = 'dono' | 'atendente';
/** Conteúdo do cookie: login, papel, versão da conta e validade (epoch em segundos). */
export interface Sessao {
  u: string;
  p: Papel;
  v: number;
  exp: number;
}

export const SESSION_COOKIE = 'wac_session';
export const VALIDADE_S: Record<Papel, number> = {
  dono: 30 * 24 * 60 * 60,
  atendente: 7 * 24 * 60 * 60,
};

/**
 * Chave do HMAC. Sem segredo próprio, deriva da senha do dono: trocar essa
 * senha derruba todas as sessões, inclusive as da equipe.
 */
export function chaveDeSessao(env?: Partial<NodeJS.ProcessEnv>): string | null {
  const e = env || process.env;
  if (e.PANEL_SESSION_SECRET) return e.PANEL_SESSION_SECRET;
  return e.PANEL_PASS ? `wac-sessao-v2:${e.PANEL_PASS}` : null;
}

function assinatura(payload: string, chave: string): Buffer {
  return createHmac('sha256', chave).update(`v2.${payload}`).digest();
}

export function novaSessao(login: string, papel: Papel, versao: number, agoraS = Math.floor(Date.now() / 1000)): Sessao {
  return { u: login, p: papel, v: versao, exp: agoraS + VALIDADE_S[papel] };
}

export function assinarSessao(s: Sessao, chave: string): string {
  const payload = Buffer.from(JSON.stringify(s)).toString('base64url');
  return `v2.${payload}.${assinatura(payload, chave).toString('base64url')}`;
}

export function lerSessao(token: string, chave: string, agoraS = Math.floor(Date.now() / 1000)): Sessao | null {
  const partes = token.split('.');
  if (partes.length !== 3 || partes[0] !== 'v2') return null;
  const [, payload, sig] = partes as [string, string, string];
  const esperado = assinatura(payload, chave);
  const obtido = Buffer.from(sig, 'base64url');
  if (obtido.length !== esperado.length || !timingSafeEqual(obtido, esperado)) return null;
  let s: Partial<Sessao>;
  try {
    s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<Sessao>;
  } catch {
    return null;
  }
  if (typeof s.u !== 'string' || (s.p !== 'dono' && s.p !== 'atendente')) return null;
  if (typeof s.v !== 'number' || typeof s.exp !== 'number' || s.exp < agoraS) return null;
  return { u: s.u, p: s.p, v: s.v, exp: s.exp };
}
