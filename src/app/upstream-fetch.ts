import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { UpstreamCommit, UpstreamSnapshot } from './upstream-core.js';

/**
 * Adaptador de rede do vigia de upstream: commits da master do Baileys (GitHub)
 * e dist-tag `latest` (npm). `fetch` é injetável pra testar sem rede.
 */

const GITHUB_COMMITS =
  'https://api.github.com/repos/WhiskeySockets/Baileys/commits?sha=master&per_page=30';
const NPM_DIST_TAGS = 'https://registry.npmjs.org/-/package/baileys/dist-tags';
const UA = 'whatsapp-automation-radar';

interface GithubCommit {
  sha?: string;
  commit?: { message?: string; author?: { date?: string } };
}

export interface UpstreamFetchOpts {
  /** Token do GitHub (qualquer escopo serve pra repo público). Sem ele o limite
   *  anônimo é por IP — na nuvem o IP é compartilhado e devolve 403 direto. */
  token?: string | null;
}

export async function buscarUpstream(
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
  opts: UpstreamFetchOpts = {},
): Promise<UpstreamSnapshot> {
  // GitHub é a fonte principal: sem ela não há o que comparar → erro sobe.
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': UA,
  };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const gh = await fetchFn(GITHUB_COMMITS, { headers });
  if (!gh.ok) throw new Error(`GitHub respondeu ${gh.status}`);
  const lista = (await gh.json()) as GithubCommit[];
  const commits: UpstreamCommit[] = [];
  for (const c of Array.isArray(lista) ? lista : []) {
    if (!c.sha) continue;
    commits.push({
      sha: c.sha.slice(0, 7),
      data: (c.commit?.author?.date ?? '').slice(0, 10),
      titulo: (c.commit?.message ?? '').split('\n')[0] ?? '',
    });
  }

  // npm é complemento: falha vira "sem versão", não derruba a checagem.
  let versaoNpm: string | null = null;
  try {
    const npm = await fetchFn(NPM_DIST_TAGS, { headers: { 'user-agent': UA } });
    if (npm.ok) {
      const tags = (await npm.json()) as { latest?: string };
      versaoNpm = typeof tags.latest === 'string' ? tags.latest : null;
    }
  } catch {
    versaoNpm = null;
  }

  return { commits, versaoNpm };
}

/**
 * Versão do baileys que ESTE processo carrega (não a do package.json da raiz,
 * que é um range). Sobe a partir do entrypoint resolvido até achar o
 * package.json do pacote — o baileys não expõe o próprio package.json nos exports.
 */
export function versaoBaileysInstalada(): string {
  const req = createRequire(import.meta.url);
  let dir = dirname(req.resolve('baileys'));
  for (let i = 0; i < 6; i++) {
    const candidato = join(dir, 'package.json');
    if (existsSync(candidato)) {
      const pkg = JSON.parse(readFileSync(candidato, 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === 'baileys' && typeof pkg.version === 'string') return pkg.version;
    }
    const acima = dirname(dir);
    if (acima === dir) break;
    dir = acima;
  }
  return 'desconhecida';
}
