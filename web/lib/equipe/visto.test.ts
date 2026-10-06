import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';

let tmp: string;
let mod: typeof import('./visto');
beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-visto-'));
  await mkdir(join(tmp, 'data'), { recursive: true });
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  mod = await import('./visto');
});
afterAll(async () => rm(tmp, { recursive: true, force: true }));

it('visto é por atendente e por chat', async () => {
  expect(await mod.lerVisto('ana')).toEqual({});
  await mod.marcarVisto('ana', 'grupo-a', '2026-10-06T12:00:00.000Z');
  await mod.marcarVisto('bia', 'grupo-a', '2026-10-06T13:00:00.000Z');
  expect(await mod.lerVisto('ana')).toEqual({ 'grupo-a': '2026-10-06T12:00:00.000Z' });
  expect(await mod.lerVisto('bia')).toEqual({ 'grupo-a': '2026-10-06T13:00:00.000Z' });
});
