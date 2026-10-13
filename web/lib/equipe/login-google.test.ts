import { describe, expect, it } from 'vitest';
import { emailDoIdToken, urlDeLoginGoogle } from './login-google';

const CLIENTE = 'cliente-123.apps.googleusercontent.com';
const agoraS = 1_800_000_000;
const jwt = (payload: Record<string, unknown>) =>
  `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.assinatura`;
const valido = { iss: 'https://accounts.google.com', aud: CLIENTE, exp: agoraS + 300, email: 'Dono@Exemplo.com', email_verified: true };

describe('urlDeLoginGoogle', () => {
  it('pede só a identidade (openid e e-mail) e deixa escolher a conta', () => {
    const u = new URL(urlDeLoginGoogle({ clientId: CLIENTE, clientSecret: 's' }, 'https://painel/api/login/google/callback', 'st'));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('scope')).toBe('openid email');
    expect(u.searchParams.get('prompt')).toBe('select_account');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('state')).toBe('st');
    expect(u.searchParams.get('redirect_uri')).toBe('https://painel/api/login/google/callback');
    expect(u.searchParams.get('access_type')).toBeNull();
  });
});

describe('emailDoIdToken', () => {
  it('devolve o e-mail verificado, em minúsculas', () => {
    expect(emailDoIdToken(jwt(valido), CLIENTE, agoraS)).toBe('dono@exemplo.com');
    expect(emailDoIdToken(jwt({ ...valido, iss: 'accounts.google.com' }), CLIENTE, agoraS)).toBe('dono@exemplo.com');
  });
  it('recusa token de outro aplicativo, de outro emissor ou vencido', () => {
    expect(emailDoIdToken(jwt({ ...valido, aud: 'outro' }), CLIENTE, agoraS)).toBeNull();
    expect(emailDoIdToken(jwt({ ...valido, iss: 'https://evil.example' }), CLIENTE, agoraS)).toBeNull();
    expect(emailDoIdToken(jwt({ ...valido, exp: agoraS - 1 }), CLIENTE, agoraS)).toBeNull();
  });
  it('recusa e-mail não verificado pelo Google', () => {
    expect(emailDoIdToken(jwt({ ...valido, email_verified: false }), CLIENTE, agoraS)).toBeNull();
    expect(emailDoIdToken(jwt({ ...valido, email_verified: 'true' }), CLIENTE, agoraS)).toBeNull();
  });
  it('recusa token mal formado', () => {
    expect(emailDoIdToken('', CLIENTE, agoraS)).toBeNull();
    expect(emailDoIdToken('a.b', CLIENTE, agoraS)).toBeNull();
    expect(emailDoIdToken('a.###.c', CLIENTE, agoraS)).toBeNull();
  });
});
