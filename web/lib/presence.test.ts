import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// O sidecar de presença deriva de DATA_DIR (resolvido no import de ./paths).
let tmp: string;
let mod: typeof import('./presence');

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-presenca-'));
  await mkdir(join(tmp, 'data'), { recursive: true });
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  mod = await import('./presence');
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function gravar(presences: Record<string, unknown>) {
  await writeFile(join(tmp, 'data', '.presence.json'), JSON.stringify({ version: 1, updatedAt: '', presences }));
}

describe('readPresence', () => {
  it('diz quem está digitando no grupo (só o número do participante)', async () => {
    await gravar({
      g: { chatJid: '1@g.us', participant: '5511999998888:3@s.whatsapp.net', state: 'composing', lastSeen: null, updatedAt: Date.now() },
    });
    expect(await mod.readPresence('g')).toEqual({ status: 'typing', lastSeen: null, participante: '5511999998888' });
  });

  it('sem participante conhecido, participante fica nulo', async () => {
    await gravar({ d: { chatJid: '2@s.whatsapp.net', participant: '', state: 'available', lastSeen: 10, updatedAt: Date.now() } });
    expect(await mod.readPresence('d')).toEqual({ status: 'online', lastSeen: 10, participante: null });
  });

  it('digitando velho demais vira só o visto por último', async () => {
    await gravar({ g: { chatJid: '1@g.us', participant: '55@s.whatsapp.net', state: 'composing', lastSeen: 5, updatedAt: Date.now() - 60_000 } });
    expect(await mod.readPresence('g')).toEqual({ status: 'offline', lastSeen: 5, participante: '55' });
  });
});
