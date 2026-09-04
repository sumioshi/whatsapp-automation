/**
 * Extrai `owner/repo` de uma URL de remoto do GitHub. Aceita ssh com alias de
 * host (`git@github.com-x:`), `ssh://` e https. Outro host devolve null.
 */
export function githubDoRemoto(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  const m =
    /^git@github\.com(?:-[\w.-]+)?:([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(u) ??
    /^(?:ssh:\/\/git@|https?:\/\/(?:[\w.-]+@)?)github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(u);
  if (!m?.[1] || !m[2]) return null;
  return `${m[1]}/${m[2]}`;
}
