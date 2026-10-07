/** Caminho interno seguro pra navegar depois do login; "/" quando o valor não é. */
export function caminhoInterno(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return '/';
  try {
    const u = new URL(raw, 'http://x');
    return u.origin === 'http://x' ? u.pathname + u.search : '/';
  } catch {
    return '/';
  }
}
