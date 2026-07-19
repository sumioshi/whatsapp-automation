import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { readRecentMessages } from './server';

describe('readRecentMessages', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'wac-msgs-'));
  });

  it('conversa inexistente devolve lista vazia (lead que não respondeu)', async () => {
    expect(await readRecentMessages(dataDir, 'dm-inexistente', 30)).toEqual([]);
  });

  it('devolve as últimas N achatadas e ignora linha corrompida', async () => {
    const slug = 'dm-123';
    await mkdir(join(dataDir, slug), { recursive: true });
    const linhas = [
      JSON.stringify({ fromMe: false, text: 'oi', timestamp: '2026-07-19T00:00:00.000Z', senderName: 'Lead' }),
      'lixo-nao-json',
      JSON.stringify({ fromMe: true, text: 'opa', timestamp: '2026-07-19T00:01:00.000Z' }),
    ].join('\n');
    await writeFile(join(dataDir, slug, 'messages.jsonl'), `${linhas}\n`);

    const out = await readRecentMessages(dataDir, slug, 30);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      fromMe: false,
      text: 'oi',
      timestamp: Date.parse('2026-07-19T00:00:00.000Z'),
      author: 'Lead',
    });
    expect(out[1]).toMatchObject({ fromMe: true, text: 'opa', author: null });
  });

  it('respeita o limite (só as mais recentes)', async () => {
    const slug = 'dm-456';
    await mkdir(join(dataDir, slug), { recursive: true });
    const linhas = Array.from({ length: 5 }, (_, i) =>
      JSON.stringify({ fromMe: false, text: `m${i}`, timestamp: '2026-07-19T00:00:00.000Z' }),
    ).join('\n');
    await writeFile(join(dataDir, slug, 'messages.jsonl'), `${linhas}\n`);

    const out = await readRecentMessages(dataDir, slug, 2);
    expect(out.map((m) => m.text)).toEqual(['m3', 'm4']);
  });
});
