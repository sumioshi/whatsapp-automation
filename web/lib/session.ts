/**
 * Sessão do painel por cookie assinado — sem banco e sem env extra.
 *
 * O token é HMAC-SHA256 da identidade da sessão, chaveado pela PRÓPRIA senha
 * do painel: determinístico (o proxy recomputa e compara), impossível de forjar
 * sem a senha, e trocar a senha revoga todas as sessões automaticamente.
 * WebCrypto puro para rodar igual no edge (proxy) e no Node (rotas/testes).
 */

const PREFIX = 'wac-panel-session:v1:';

async function hmac(pass: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(pass),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  // base64url sem padding — seguro pra valor de cookie.
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/** Token de sessão para o par usuário/senha vigente. */
export function sessionToken(user: string, pass: string): Promise<string> {
  return hmac(pass, PREFIX + user);
}

/** true se o token corresponde às credenciais vigentes. */
export async function verifySession(token: string, user: string, pass: string): Promise<boolean> {
  if (!token) return false;
  const expected = await sessionToken(user, pass);
  // Comparação em tempo constante (tokens têm tamanho fixo de HMAC-SHA256).
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Nome do cookie de sessão do painel. */
export const SESSION_COOKIE = 'wac_session';
/** Validade do cookie: 30 dias. */
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;
