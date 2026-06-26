// Garante a mídia local, baixando da nuvem sob demanda (cacheia depois).
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { cloudEnabled, cloudFetch } from './cloud';
import { safeDataPath } from './paths';

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Caminho absoluto da mídia (relativa a DATA_DIR). Se não existe local e a nuvem
 * está configurada, baixa de /api/media e cacheia. Sem nuvem e sem arquivo → erro.
 */
export async function ensureLocalMedia(relPath: string): Promise<string> {
  const abs = safeDataPath(relPath);
  if (await exists(abs)) return abs;
  if (!cloudEnabled()) {
    throw new Error(`Mídia não está no Mac e WAC_CLOUD_URL não configurado: ${relPath}`);
  }
  const url = `/api/media/${relPath.split('/').map(encodeURIComponent).join('/')}`;
  const res = await cloudFetch(url);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, Buffer.from(await res.arrayBuffer()));
  return abs;
}
