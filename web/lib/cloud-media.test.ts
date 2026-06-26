import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wac-media-'));
  vi.stubEnv('WAC_DATA_DIR', dir);
  vi.resetModules(); // paths.ts/cloud.ts leem env no import → reimporta limpo por teste
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('arquivo local existe → retorna sem rede', async () => {
  vi.stubEnv('WAC_CLOUD_URL', '');
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const { ensureLocalMedia } = await import('./cloud-media');
  await mkdir(join(dir, 'g/audio'), { recursive: true });
  await writeFile(join(dir, 'g/audio/x.ogg'), 'oi');
  expect(await ensureLocalMedia('g/audio/x.ogg')).toBe(join(dir, 'g/audio/x.ogg'));
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('sem arquivo e sem nuvem → erro claro', async () => {
  vi.stubEnv('WAC_CLOUD_URL', '');
  const { ensureLocalMedia } = await import('./cloud-media');
  await expect(ensureLocalMedia('g/audio/nao.ogg')).rejects.toThrow(/WAC_CLOUD_URL/);
});

it('sem arquivo e com nuvem → baixa e cacheia', async () => {
  vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
  vi.stubEnv('WAC_CLOUD_USER', 'u');
  vi.stubEnv('WAC_CLOUD_PASS', 'p');
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
  );
  const { ensureLocalMedia } = await import('./cloud-media');
  const abs = await ensureLocalMedia('g/audio/baixa.ogg');
  expect(abs).toBe(join(dir, 'g/audio/baixa.ogg'));
  expect(await readFile(abs)).toEqual(Buffer.from([1, 2, 3]));
});
