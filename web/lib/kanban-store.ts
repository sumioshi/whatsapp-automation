import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { estadoInicial, type KanbanState } from './kanban';
import { DATA_DIR } from './paths';

/** Persistência do board (server-only — o módulo kanban.ts é puro/client-safe). */

const FILE = () => join(DATA_DIR, '.kanban.json');

export async function readKanban(): Promise<KanbanState> {
  try {
    const parsed = JSON.parse(await readFile(FILE(), 'utf8')) as Partial<KanbanState>;
    if (Array.isArray(parsed.colunas) && parsed.colunas.length > 0) {
      return { colunas: parsed.colunas, cartoes: parsed.cartoes ?? {} };
    }
  } catch {
    // arquivo ausente/corrompido → estado inicial
  }
  return estadoInicial();
}

export async function writeKanban(state: KanbanState): Promise<void> {
  await writeJsonAtomic(FILE(), state);
}
