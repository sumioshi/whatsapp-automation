import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { DATA_DIR } from './paths';

/**
 * Checkpoint do agente de TRIAGEM (o worker que roda no GitHub): até quando ele
 * já processou cada chat. Separado do `.agent-seen.json`, que pertence ao
 * operador em sessão interativa — consumidores diferentes não podem colidir.
 */
const TRIAGEM_SEEN_FILE = join(DATA_DIR, '.triagem-seen.json');

export async function readTriagemSeen(): Promise<Record<string, string>> {
  try {
    const parsed = JSON.parse(await readFile(TRIAGEM_SEEN_FILE, 'utf8')) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [slug, ts] of Object.entries(parsed)) {
      if (typeof ts === 'string') out[slug] = ts;
    }
    return out;
  } catch {
    return {};
  }
}

/** Avança o checkpoint do chat. Nunca recua: retorna false se `ate` não é mais novo. */
export async function avancarTriagemSeen(slug: string, ate: string): Promise<boolean> {
  if (Number.isNaN(Date.parse(ate))) throw new Error('ate deve ser um timestamp ISO');
  const atual = await readTriagemSeen();
  const anterior = atual[slug];
  if (anterior && anterior >= ate) return false;
  await writeJsonAtomic(TRIAGEM_SEEN_FILE, { ...atual, [slug]: ate });
  return true;
}
