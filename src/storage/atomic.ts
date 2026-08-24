import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Escrita atômica de JSON (tmp + rename) para os sidecars do coletor.
 * Espelho do helper do painel (web/lib/json-store) — os dois lados escrevem
 * nos mesmos diretórios e a atomicidade evita leitura de arquivo pela metade.
 */
export async function writeJsonAtomicNode(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${process.pid}-${Date.now()}.tmp`);
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}
