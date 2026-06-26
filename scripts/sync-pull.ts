// Puxa os .jsonl da nuvem e mergeia no data/ local (Mac-side).
// No-op silencioso sem WAC_CLOUD_URL. Sai 0 mesmo em erro (não bloqueia o `dev`).
// Incremental: pula arquivos cujo mtime na nuvem não mudou desde a última sync.
// Baixa em paralelo (o gargalo é latência por request via Tailscale, não banda).
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { cloudEnabled, cloudFetch, cloudUrl } from '../web/lib/cloud';
import { mergeDedupLines, mergeMessagesById } from './lib/jsonl-merge';

const DATA_DIR = resolve(process.env.WAC_DATA_DIR ?? join(process.cwd(), 'data'));
const STATE_FILE = join(DATA_DIR, '.sync-state.json');
const CONCURRENCY = Number(process.env.WAC_SYNC_CONCURRENCY ?? '8');

async function readOrEmpty(p: string): Promise<string> {
  try {
    return await readFile(p, 'utf8');
  } catch {
    return '';
  }
}

async function readState(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8')) as Record<string, number>;
  } catch {
    return {};
  }
}

async function writeAtomic(p: string, content: string): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, p);
}

/** Baixa um .jsonl da nuvem (descomprime se veio gzipado pela rota). */
async function fetchText(rel: string): Promise<string> {
  const enc = rel.split('/').map(encodeURIComponent).join('/');
  const res = await cloudFetch(`/api/sync/file/${enc}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return res.headers.get('x-wac-gzip') === '1' ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
}

/** Roda `fn` sobre `items` com no máx. `n` em voo ao mesmo tempo. */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async (): Promise<void> => {
    while (i < items.length) {
      await fn(items[i++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

async function main(): Promise<void> {
  if (!cloudEnabled()) {
    console.log('[sync] WAC_CLOUD_URL não setado — pulando.');
    return;
  }
  console.log(`[sync] puxando de ${cloudUrl()} …`);
  const manifest = (await (await cloudFetch('/api/sync/manifest')).json()) as {
    files: { path: string; mtime: number }[];
  };
  // Escopo: 'local' (default) só sincroniza grupos que o Mac JÁ acompanha — evita
  // puxar as centenas de DMs/grupos que a history sync trouxe pra nuvem. 'all' = tudo.
  let files = manifest.files;
  if ((process.env.WAC_SYNC_SCOPE ?? 'local') === 'local') {
    const localGroups = new Set(await readdir(DATA_DIR).catch(() => []));
    files = files.filter((f) => localGroups.has(f.path.split('/')[0]));
  }
  const state = await readState();
  const toFetch = files.filter((f) => state[f.path] === undefined || f.mtime > state[f.path]);
  const skipped = files.length - toFetch.length;
  let changed = 0;
  let failed = 0;

  await pool(toFetch, CONCURRENCY, async ({ path: rel, mtime }) => {
    try {
      const remote = await fetchText(rel);
      const localPath = join(DATA_DIR, rel);
      const local = await readOrEmpty(localPath);
      const out = rel.endsWith('messages.jsonl')
        ? mergeMessagesById(local, remote)
        : mergeDedupLines(local, remote);
      if (out && out !== local) {
        await writeAtomic(localPath, out);
        changed++;
      }
      state[rel] = mtime; // só marca como sincronizado em caso de sucesso
    } catch (err) {
      failed++;
      console.error(`[sync] falhou ${rel}:`, (err as Error)?.message ?? err);
    }
  });

  await writeAtomic(STATE_FILE, JSON.stringify(state));
  console.log(`[sync] pronto — ${changed} atualizado(s), ${skipped} sem mudança, ${failed} falha(s).`);
}

main().catch((err) => {
  console.error('[sync] falhou (seguindo sem bloquear):', (err as Error)?.message ?? err);
  process.exitCode = 0;
});
