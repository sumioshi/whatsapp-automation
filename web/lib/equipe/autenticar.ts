import { createHash, timingSafeEqual } from 'node:crypto';
import { chaveDeSessao, lerSessao, type Papel, SESSION_COOKIE } from './sessao';
import { acharUsuario, type Usuario } from './usuarios';

export interface Credenciais {
  user: string;
  pass: string;
}

export interface Quem {
  papel: Papel;
  login: string;
}

export function credenciaisDoDono(env: Partial<NodeJS.ProcessEnv> = process.env): Credenciais | null {
  return env.PANEL_USER && env.PANEL_PASS ? { user: env.PANEL_USER, pass: env.PANEL_PASS } : null;
}

/** Comparação em tempo constante, mesmo com tamanhos diferentes (compara digests). */
export function igualSeguro(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db) && a.length === b.length;
}

/** Basic Auth por header: só o dono (MCP remoto, plantão, sync, CI). */
export function donoPorBasic(header: string | null, cred: Credenciais): boolean {
  const [scheme, encoded] = (header ?? '').split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx < 0) return false;
  const okUser = igualSeguro(decoded.slice(0, idx), cred.user);
  const okPass = igualSeguro(decoded.slice(idx + 1), cred.pass);
  return okUser && okPass;
}

export async function quemPelaSessao(
  token: string | undefined,
  cred: Credenciais,
  achar: (login: string) => Promise<Usuario | null>,
  chave: string,
  agoraS?: number,
): Promise<Quem | null> {
  if (!token) return null;
  const s = lerSessao(token, chave, agoraS);
  if (!s) return null;
  if (s.p === 'dono') return s.u === cred.user ? { papel: 'dono', login: s.u } : null;
  const u = await achar(s.u);
  if (!u || !u.ativo || u.versao !== s.v) return null;
  return { papel: 'atendente', login: u.login };
}

export function cookieDe(header: string | null, nome: string): string | undefined {
  if (!header) return undefined;
  for (const parte of header.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return v.join('=');
  }
  return undefined;
}

export async function quemDoPedido(
  authorization: string | null,
  cookie: string | undefined,
  cred: Credenciais,
): Promise<Quem | null> {
  if (donoPorBasic(authorization, cred)) return { papel: 'dono', login: cred.user };
  const chave = chaveDeSessao();
  if (!chave) return null;
  return quemPelaSessao(cookie, cred, acharUsuario, chave);
}

export { SESSION_COOKIE };
