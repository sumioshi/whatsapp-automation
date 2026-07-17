// Núcleo puro da migração de rename: reescreve o prefixo de mediaPath nas
// linhas jsonl que apontavam pro diretório do slug duplicado.

export function rewriteMediaPrefix(jsonl: string, from: string, to: string): string {
  const prefix = `${from}/`;
  const out = jsonl
    .split('\n')
    .map((line) => {
      const l = line.trim();
      if (!l) return line;
      let obj: { mediaPath?: string | null };
      try {
        obj = JSON.parse(l);
      } catch {
        return line;
      }
      if (typeof obj.mediaPath === 'string' && obj.mediaPath.startsWith(prefix)) {
        obj.mediaPath = `${to}/${obj.mediaPath.slice(prefix.length)}`;
        return JSON.stringify(obj);
      }
      return line;
    })
    .filter(Boolean);
  return out.length ? out.join('\n') + '\n' : '';
}
