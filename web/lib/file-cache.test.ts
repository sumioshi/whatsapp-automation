import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { cachedByStat } from './file-cache';

async function tmpFile(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wac-cache-'));
  const p = join(dir, 'messages.jsonl');
  await writeFile(p, content, 'utf8');
  return p;
}

describe('cachedByStat', () => {
  it('parseia uma vez e reusa enquanto o arquivo não muda', async () => {
    const p = await tmpFile('aaa');
    const parse = vi.fn((raw: string) => raw.toUpperCase());

    expect(await cachedByStat(p, parse)).toBe('AAA');
    expect(await cachedByStat(p, parse)).toBe('AAA');
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('re-parseia quando o arquivo cresce (append do coletor)', async () => {
    const p = await tmpFile('aaa');
    const parse = vi.fn((raw: string) => raw.toUpperCase());

    await cachedByStat(p, parse);
    await writeFile(p, 'aaa+bbb', 'utf8');
    expect(await cachedByStat(p, parse)).toBe('AAA+BBB');
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('re-parseia quando só o mtime muda (mesmo tamanho)', async () => {
    const p = await tmpFile('aaa');
    const parse = vi.fn((raw: string) => raw.toUpperCase());

    await cachedByStat(p, parse);
    await writeFile(p, 'bbb', 'utf8'); // mesmo tamanho
    const futuro = new Date(Date.now() + 5_000);
    await utimes(p, futuro, futuro);
    expect(await cachedByStat(p, parse)).toBe('BBB');
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('arquivo ausente devolve null e não envenena o cache', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wac-cache-'));
    const p = join(dir, 'nao-existe.jsonl');
    const parse = vi.fn((raw: string) => raw);

    expect(await cachedByStat(p, parse)).toBeNull();
    await writeFile(p, 'agora sim', 'utf8');
    expect(await cachedByStat(p, parse)).toBe('agora sim');
  });

  it('arquivo apagado depois de cacheado volta a ser null', async () => {
    const p = await tmpFile('aaa');
    const parse = vi.fn((raw: string) => raw);
    await cachedByStat(p, parse);
    await rm(p);
    expect(await cachedByStat(p, parse)).toBeNull();
  });
});
