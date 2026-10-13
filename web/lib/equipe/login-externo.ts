/**
 * Quem pode entrar sem senha (Google ou código por e-mail): os e-mails do dono em
 * PANEL_OWNER_EMAILS, separados por vírgula ou espaço. Sem a variável, esses dois
 * caminhos ficam desligados e só a senha vale.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailValido(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

export function emailsDoDono(env: Partial<NodeJS.ProcessEnv> = process.env): string[] {
  return (env.PANEL_OWNER_EMAILS ?? '')
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(emailValido);
}

export function ehEmailDoDono(email: string, env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  const e = email.trim().toLowerCase();
  return e !== '' && emailsDoDono(env).includes(e);
}

/**
 * Pedido de login vindo da própria tela: JSON e, quando o navegador informa a origem,
 * do mesmo site. Um formulário de outro site não manda application/json sem passar
 * pela checagem do CORS, então isso fecha o login forçado por página de terceiros.
 */
export function pedidoDoProprioSite(headers: Headers): boolean {
  const tipo = (headers.get('content-type') ?? '').toLowerCase();
  if (!tipo.startsWith('application/json')) return false;
  const site = headers.get('sec-fetch-site');
  return site === null || site === 'same-origin' || site === 'none';
}
