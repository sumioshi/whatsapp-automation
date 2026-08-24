import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fundirConversa } from './fundir-conversa.js';

async function monta(base: string, slug: string, linhas: string[], midia?: string) {
  const dir = join(base, slug);
  await mkdir(join(dir, 'audio'), { recursive: true });
  await writeFile(join(dir, 'messages.jsonl'), linhas.map((l) => `${l}\n`).join(''), 'utf8');
  if (midia) await writeFile(join(dir, 'audio', midia), 'bytes', 'utf8');
}

describe('fundirConversa', () => {
  it('funde jsonl por id, move mídia e remove o diretório duplicado', async () => {
    const base = await mkdtemp(join(tmpdir(), 'wac-fundir-'));
    await monta(base, 'dm-5511999', ['{"id":"a","timestamp":"2026-01-01T00:00:00Z"}']);
    await monta(
      base,
      'dm-777lid',
      [
        '{"id":"a","timestamp":"2026-01-01T00:00:00Z"}',
        `{"id":"b","timestamp":"2026-01-02T00:00:00Z","mediaPath":"dm-777lid/audio/x.ogg"}`,
      ],
      'x.ogg',
    );

    const r = await fundirConversa(base, 'dm-5511999', 'dm-777lid');

    expect(r.ok).toBe(true);
    const jsonl = await readFile(join(base, 'dm-5511999', 'messages.jsonl'), 'utf8');
    const ids = jsonl.trim().split('\n').map((l) => JSON.parse(l).id);
    expect(ids.sort()).toEqual(['a', 'b']); // dedup por id
    expect(jsonl).toContain('dm-5511999/audio/x.ogg'); // mediaPath reescrito
    const arquivos = await readdir(join(base, 'dm-5511999', 'audio'));
    expect(arquivos).toContain('x.ogg');
    const raiz = await readdir(base);
    expect(raiz).not.toContain('dm-777lid');
  });

  it('duplicado sem messages.jsonl vira mover simples e canônico inexistente é criado', async () => {
    const base = await mkdtemp(join(tmpdir(), 'wac-fundir-'));
    await monta(base, 'dm-777lid', ['{"id":"z","timestamp":"2026-01-01T00:00:00Z"}']);

    const r = await fundirConversa(base, 'dm-5511999', 'dm-777lid');

    expect(r.ok).toBe(true);
    const jsonl = await readFile(join(base, 'dm-5511999', 'messages.jsonl'), 'utf8');
    expect(jsonl).toContain('"z"');
  });

  it('recusa quando o duplicado não existe', async () => {
    const base = await mkdtemp(join(tmpdir(), 'wac-fundir-'));
    const r = await fundirConversa(base, 'dm-a', 'dm-b');
    expect(r.ok).toBe(false);
  });
});
