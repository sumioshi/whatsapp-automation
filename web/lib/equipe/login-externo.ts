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
