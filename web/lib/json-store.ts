import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Escreve JSON de forma atômica (tmp + rename), criando o diretório se preciso.
 * Compartilhado pelos stores do painel (triagem, checkpoint do agente, etc.).
 */
export async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${Date.now()}.tmp`);
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}
