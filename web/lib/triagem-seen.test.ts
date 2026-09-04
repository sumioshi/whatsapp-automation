import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let tmp: string;
let mod: typeof import('./triagem-seen');

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-tseen-'));
  await mkdir(join(tmp, 'data'), { recursive: true });
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  mod = await import('./triagem-seen');
});
afterAll(async () => rm(tmp, { recursive: true, force: true }));

describe('triagem-seen', () => {
  it('vazio no início', async () => {
    expect(await mod.readTriagemSeen()).toEqual({});
  });
  it('avança e não recua', async () => {
    expect(await mod.avancarTriagemSeen('g', '2026-09-04T10:00:00.000Z')).toBe(true);
    expect(await mod.avancarTriagemSeen('g', '2026-09-04T09:00:00.000Z')).toBe(false);
    expect(await mod.readTriagemSeen()).toEqual({ g: '2026-09-04T10:00:00.000Z' });
    expect(await mod.avancarTriagemSeen('g', '2026-09-04T11:00:00.000Z')).toBe(true);
  });
  it('recusa timestamp inválido', async () => {
    await expect(mod.avancarTriagemSeen('g', 'ontem')).rejects.toThrow(/ISO/);
  });
});
