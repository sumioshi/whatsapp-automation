import { readFile } from 'node:fs/promises';
import { writeJsonAtomic } from './json-store';
import { safeDataPath } from './paths';

/**
 * Mapa slug do chat -> nomes de pasta (basename do worktree ou nome do repo no Orca).
 * Vive em `DATA_DIR/orca-repos.json` e é editável pela UI do escritório; a fonte da
 * verdade é a máquina que roda o Orca (o relay leva o mapa no snapshot para a nuvem).
 */
export type OrcaReposMap = Record<string, string[]>;

export const ORCA_REPOS_FILE = () => safeDataPath('orca-repos.json');

/** Semente usada quando o arquivo ainda não existe: vazia, cada instalação vincula os seus. */
export const ORCA_REPOS_PADRAO: OrcaReposMap = {};

function normalizarMapa(raw: unknown): OrcaReposMap | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: OrcaReposMap = {};
  for (const [slug, pastas] of Object.entries(raw as Record<string, unknown>)) {
    if (!slug.trim() || !Array.isArray(pastas)) continue;
    const limpas = pastas
      .filter((p): p is string => typeof p === 'string')
      .map((p) => p.trim())
      .filter(Boolean);
    out[slug] = [...new Set(limpas)];
  }
  return out;
}

/** Lê o mapa; sem arquivo (ou arquivo inválido) devolve uma cópia da semente. */
export async function readOrcaRepos(): Promise<OrcaReposMap> {
  try {
    const raw = await readFile(ORCA_REPOS_FILE(), 'utf8');
    const parsed = normalizarMapa(JSON.parse(raw));
    if (parsed) return parsed;
  } catch {
    // arquivo ainda não existe ou está corrompido: semente
  }
  return structuredClone(ORCA_REPOS_PADRAO);
}

export async function saveOrcaRepos(mapa: OrcaReposMap): Promise<void> {
  await writeJsonAtomic(ORCA_REPOS_FILE(), normalizarMapa(mapa) ?? {});
}

/** Substitui o mapa local pelo que veio do snapshot, só quando o conteúdo mudou. */
export async function syncOrcaReposFromSnapshot(mapa: unknown): Promise<boolean> {
  const novo = normalizarMapa(mapa);
  if (!novo) return false;
  const atual = await readOrcaRepos();
  if (JSON.stringify(atual) === JSON.stringify(novo)) return false;
  await saveOrcaRepos(novo);
  return true;
}

/** Adiciona `folder` ao slug (idempotente; a pasta nova vira a primeira candidata). */
export async function vincularRepoOrca(slug: string, folder: string): Promise<OrcaReposMap> {
  const s = slug.trim();
  const f = folder.trim();
  if (!s) throw new Error('slug obrigatório');
  if (!f) throw new Error('pasta do worktree obrigatória');
  const mapa = await readOrcaRepos();
  const atual = (mapa[s] ?? []).filter((p) => p.toLowerCase() !== f.toLowerCase());
  mapa[s] = [f, ...atual];
  await saveOrcaRepos(mapa);
  return mapa;
}

/** Remove `folder` do slug; sem `folder`, apaga o vínculo inteiro. Slug sem pastas some do mapa. */
export async function desvincularRepoOrca(slug: string, folder?: string): Promise<OrcaReposMap> {
  const s = slug.trim();
  if (!s) throw new Error('slug obrigatório');
  const mapa = await readOrcaRepos();
  if (!(s in mapa)) return mapa;
  const f = folder?.trim();
  const restantes = f ? mapa[s].filter((p) => p.toLowerCase() !== f.toLowerCase()) : [];
  if (restantes.length > 0) mapa[s] = restantes;
  else delete mapa[s];
  await saveOrcaRepos(mapa);
  return mapa;
}
