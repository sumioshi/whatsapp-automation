import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// O mapa de contatos lê DATA_DIR (resolvido no import de ./paths a partir de WAC_DATA_DIR).
let tmp: string;
let mod: typeof import('./contacts');

const linha = (sender: string, senderName: string) =>
  `${JSON.stringify({ id: `${sender}-${senderName}`, timestamp: '2026-10-07T12:00:00Z', sender, senderName })}\n`;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-time-'));
  const data = join(tmp, 'data');
  await mkdir(join(data, 'grupo-a'), { recursive: true });
  await writeFile(
    join(data, 'grupo-a', 'messages.jsonl'),
    linha('100000000000001@lid', 'Ana Time') + linha('5511900000001@s.whatsapp.net', 'Ana Time'),
  );
  const sidecar = {
    version: 1,
    contacts: {
      '100000000000001': { phone: '5511900000001', lid: '100000000000001', name: 'Ana Time' },
      '5511900000001': { phone: '5511900000001', lid: '100000000000001', name: 'Ana Time' },
    },
  };
  await writeFile(join(data, '.contacts.json'), JSON.stringify(sidecar));
  // Marcada antes de o WhatsApp passar a mandar o telefone: só o LID está gravado.
  await writeFile(join(data, '.team.json'), JSON.stringify(['100000000000001']));
  process.env.WAC_DATA_DIR = data;
  mod = await import('./contacts');
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('buildContacts e o time', () => {
  it('quem foi marcado pelo LID também é do time quando escreve pelo telefone', async () => {
    const c = await mod.buildContacts();
    expect(mod.roleOf(c, '100000000000001')).toBe('team');
    expect(mod.roleOf(c, '5511900000001')).toBe('team');
  });
});
