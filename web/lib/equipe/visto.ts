import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from '../json-store';
import { DATA_DIR } from '../paths';
import { LOGIN_RE } from './usuarios';

/** Não lido do atendente: separado do lastSeen do dono (.triage.json). */
function arquivo(login: string): string {
  if (!LOGIN_RE.test(login)) throw new Error('login inválido');
  return join(DATA_DIR, '.equipe', `visto-${login}.json`);
}

export async function lerVisto(login: string): Promise<Record<string, string>> {
  try {
    const parsed = JSON.parse(await readFile(arquivo(login), 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

const filas = new Map<string, Promise<unknown>>();

export function marcarVisto(login: string, slug: string, iso: string): Promise<void> {
  const anterior = filas.get(login) ?? Promise.resolve();
  const passo = anterior.then(async () => {
    const atual = await lerVisto(login);
    atual[slug] = iso;
    await writeJsonAtomic(arquivo(login), atual);
  });
  filas.set(login, passo.catch(() => {}));
  return passo;
}

/** Some com o não lido da conta (apagada): um login recriado começa do zero. */
export function apagarVisto(login: string): Promise<void> {
  const anterior = filas.get(login) ?? Promise.resolve();
  const passo = anterior.then(() => rm(arquivo(login), { force: true }));
  filas.set(login, passo.catch(() => {}));
  return passo;
}
