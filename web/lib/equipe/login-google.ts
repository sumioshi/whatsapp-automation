import type { ConfigOAuth } from '../google/oauth';

/**
 * "Entrar com Google": o mesmo cliente OAuth da Agenda, pedindo só a identidade
 * (openid e e-mail). Não guarda token do Google; só usa o e-mail verificado para
 * decidir se a pessoa é o dono.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EMISSORES = new Set(['https://accounts.google.com', 'accounts.google.com']);

export const CAMINHO_CALLBACK_LOGIN = '/api/login/google/callback';
/** Cookies curtos do vaivém com o Google: o `state` assinado e o destino depois de entrar. */
export const COOKIE_STATE_LOGIN = 'wac_login_google';
export const COOKIE_DESTINO_LOGIN = 'wac_login_destino';

export function urlDeLoginGoogle(cfg: ConfigOAuth, redirect: string, state: string): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'openid email',
    prompt: 'select_account',
    state,
  });
  return `${AUTH_URL}?${q}`;
}

/**
 * E-mail verificado de um id_token recebido direto do endpoint de token do Google
 * (TLS e segredo do cliente): nesse caso o OpenID dispensa conferir a assinatura,
 * mas emissor, destinatário, validade e verificação do e-mail são conferidos.
 */
export function emailDoIdToken(idToken: string, clientId: string, agoraS = Math.floor(Date.now() / 1000)): string | null {
  const partes = idToken.split('.');
  if (partes.length !== 3) return null;
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(Buffer.from(partes[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!p || typeof p !== 'object') return null;
  const aud = p.aud;
  const paraEsteApp = aud === clientId || (Array.isArray(aud) && aud.includes(clientId));
  if (!paraEsteApp || typeof p.iss !== 'string' || !EMISSORES.has(p.iss)) return null;
  if (typeof p.exp !== 'number' || p.exp <= agoraS) return null;
  if (p.email_verified !== true || typeof p.email !== 'string') return null;
  return p.email.trim().toLowerCase();
}

/** Troca o código da volta do Google pelo e-mail verificado; null em qualquer falha. */
export async function emailDoCodigoGoogle(cfg: ConfigOAuth, code: string, redirect: string): Promise<string | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: redirect,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const corpo = (await res.json().catch(() => null)) as { id_token?: unknown } | null;
    return typeof corpo?.id_token === 'string' ? emailDoIdToken(corpo.id_token, cfg.clientId) : null;
  } catch {
    return null;
  }
}
