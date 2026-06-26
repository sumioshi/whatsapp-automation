import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { DATA_DIR } from './paths';

/**
 * Checkpoint do AGENTE (o Claude/Codex que consome o MCP): até quando ele já viu
 * as mensagens de cada chat. Separado do `lastSeen` da triagem, que é a última
 * visita pelo PAINEL — são consumidores diferentes e não devem colidir.
 *
 * `slug -> ISO timestamp da última mensagem já entregue ao agente via `novidades`.
 */
const AGENT_SEEN_FILE = join(DATA_DIR, '.agent-seen.json');

export async function readAgentSeen(): Promise<Record<string, string>> {
  try {
    const parsed = JSON.parse(await readFile(AGENT_SEEN_FILE, 'utf8')) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [slug, ts] of Object.entries(parsed)) {
      if (typeof ts === 'string') out[slug] = ts;
    }
    return out;
  } catch {
    return {};
  }
}

/** Aplica vários avanços de checkpoint de uma vez (merge sobre o estado atual). */
export async function setAgentSeenMany(updates: Record<string, string>): Promise<void> {
  if (Object.keys(updates).length === 0) return;
  const current = await readAgentSeen();
  await writeJsonAtomic(AGENT_SEEN_FILE, { ...current, ...updates });
}
