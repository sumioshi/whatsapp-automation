import { chmod, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from '../json-store';
import { DATA_DIR } from '../paths';

/** Permissão do Google guardada no volume. Só o servidor lê; nunca sai em resposta. */
export interface TokenGuardado {
  refresh_token: string;
  access_token: string;
  /** Epoch em ms. */
  expira_em: number;
  email: string | null;
  escopos: string[];
}

export function caminhoDoToken(): string {
  return join(DATA_DIR, '.google', 'token.json');
}

export async function lerToken(arquivo = caminhoDoToken()): Promise<TokenGuardado | null> {
  try {
    const t = JSON.parse(await readFile(arquivo, 'utf8')) as Partial<TokenGuardado>;
    if (typeof t.refresh_token !== 'string' || !t.refresh_token) return null;
    return {
      refresh_token: t.refresh_token,
      access_token: typeof t.access_token === 'string' ? t.access_token : '',
      expira_em: typeof t.expira_em === 'number' ? t.expira_em : 0,
      email: typeof t.email === 'string' ? t.email : null,
      escopos: Array.isArray(t.escopos) ? t.escopos.filter((s): s is string => typeof s === 'string') : [],
    };
  } catch {
    return null;
  }
}

export async function gravarToken(t: TokenGuardado, arquivo = caminhoDoToken()): Promise<void> {
  await writeJsonAtomic(arquivo, t);
  await chmod(arquivo, 0o600);
}

export async function apagarToken(arquivo = caminhoDoToken()): Promise<void> {
  await rm(arquivo, { force: true });
}
