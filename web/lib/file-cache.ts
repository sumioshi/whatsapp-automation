import { readFile, stat } from 'node:fs/promises';

/**
 * Cache em memória de arquivo parseado, invalidado por (mtime, size).
 *
 * Feito pro padrão do coletor: arquivos append-only que mudam raramente em
 * relação à frequência de leitura do painel. O caminho quente vira um stat()
 * por arquivo; o parse (leitura + JSON por linha) só roda quando o arquivo
 * realmente mudou. Processo único por container — sem invalidação distribuída.
 */

interface Entry {
  mtimeMs: number;
  size: number;
  value: unknown;
}

const cache = new Map<string, Entry>();

/**
 * Devolve o parse do arquivo, reusando o cache enquanto (mtime, size) não
 * mudam. Arquivo ausente → null (e não envenena o cache: se surgir depois,
 * é lido normalmente).
 */
export async function cachedByStat<T>(
  path: string,
  parse: (raw: string) => T,
): Promise<T | null> {
  let s: Awaited<ReturnType<typeof stat>>;
  try {
    s = await stat(path);
  } catch {
    cache.delete(path);
    return null;
  }

  const hit = cache.get(path);
  if (hit && hit.mtimeMs === s.mtimeMs && hit.size === s.size) {
    return hit.value as T;
  }

  const value = parse(await readFile(path, 'utf8'));
  cache.set(path, { mtimeMs: s.mtimeMs, size: s.size, value });
  return value;
}
