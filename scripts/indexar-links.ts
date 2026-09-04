// Indexa na nuvem os vínculos grupo↔repo que existem no Mac (`.claude/whatsapp.json`
// em cada repo), com o repositório GitHub de cada um. Idempotente: cada POST é
// upsert por slug. Requer WAC_CLOUD_* no ambiente (o runner do npm carrega o arquivo de env).
//   npm run indexar-links            → varre ~/projetos (profundidade 4)
//   npm run indexar-links -- <raiz>  → outra raiz
import { execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { cloudEnabled, cloudPost } from '../web/lib/cloud';
import { githubDoRemoto } from './lib/git-remote';

const run = promisify(execFile);
const RAIZ = resolve(process.argv[2] ?? join(homedir(), 'projetos'));
const PROFUNDIDADE = 4;
const IGNORAR = new Set(['node_modules', '.git', 'dist', '.next', 'data']);

interface WhatsappJson {
  grupo?: string;
  cliente?: string;
  tipo?: string;
  notas?: string;
  github?: string;
}

async function acharRepos(dir: string, nivel: number, out: string[]): Promise<void> {
  if (nivel > PROFUNDIDADE) return;
  let entradas: Dirent[];
  try {
    entradas = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  if (entradas.some((e) => e.isDirectory() && e.name === '.claude')) {
    try {
      await readFile(join(dir, '.claude', 'whatsapp.json'), 'utf8');
      out.push(dir);
    } catch {
      /* .claude sem whatsapp.json */
    }
  }
  for (const e of entradas) {
    if (e.isDirectory() && !e.name.startsWith('.') && !IGNORAR.has(e.name)) {
      await acharRepos(join(dir, e.name), nivel + 1, out);
    }
  }
}

async function remoto(dir: string): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['-C', dir, 'remote', 'get-url', 'origin']);
    return githubDoRemoto(stdout);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if (!cloudEnabled()) {
    console.error('WAC_CLOUD_URL/USER/PASS ausentes no ambiente — nada a indexar.');
    process.exit(1);
  }
  const repos: string[] = [];
  await acharRepos(RAIZ, 0, repos);
  let ok = 0;
  for (const dir of repos.sort()) {
    const cfg = JSON.parse(await readFile(join(dir, '.claude', 'whatsapp.json'), 'utf8')) as WhatsappJson;
    if (!cfg.grupo) continue;
    const github = cfg.github ?? (await remoto(dir));
    const body = {
      slug: cfg.grupo,
      repoPath: dir,
      cliente: cfg.cliente ?? '',
      tipo: cfg.tipo ?? 'projeto',
      notas: cfg.notas ?? '',
      github: github ?? undefined,
      indexOnly: true,
    };
    try {
      await cloudPost('/api/links', body);
      ok++;
      console.log(`${cfg.grupo.padEnd(36)} ${github ?? '(sem github)'}  ← ${dir}`);
    } catch (e) {
      console.error(`${cfg.grupo}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\n${ok}/${repos.length} links indexados em ${RAIZ}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
