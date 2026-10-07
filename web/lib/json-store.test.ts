import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeJsonAtomic } from './json-store';

describe('writeJsonAtomic', () => {
  it('grava com o modo pedido (o temporário já nasce restrito)', async () => {
    const arq = join(await mkdtemp(join(tmpdir(), 'wac-json-')), 'segredo.json');
    await writeJsonAtomic(arq, { a: 1 }, { mode: 0o600 });
    expect((await stat(arq)).mode & 0o777).toBe(0o600);
  });
});
