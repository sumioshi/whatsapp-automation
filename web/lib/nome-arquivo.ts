/** Nome de arquivo vindo do cliente, reduzido a um basename inofensivo (só metadado, nunca caminho). */
export function nomeSeguro(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const base = raw.split(/[\\/]/).pop() ?? '';
  // biome-ignore lint/suspicious/noControlCharactersInRegex: remover controle é o objetivo
  const limpo = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\.+/, '').slice(0, 120);
  return limpo.trim() ? limpo : fallback;
}
