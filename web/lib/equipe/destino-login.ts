/** Caminho interno seguro pra navegar depois do login; "/" quando o valor não é. */
export function caminhoInterno(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return '/';
  try {
    const u = new URL(raw, 'http://x');
    if (u.origin !== 'http://x') return '/';
    const caminho = u.pathname + u.search;
    // "/.//site" normaliza para "//site", que o navegador lê como outro endereço.
    return caminho.startsWith('//') || caminho.startsWith('/\\') ? '/' : caminho;
  } catch {
    return '/';
  }
}
