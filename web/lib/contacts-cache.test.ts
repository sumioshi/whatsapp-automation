import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// O mapa de contatos lê DATA_DIR (resolvido no import de ./paths a partir de WAC_DATA_DIR).
let tmp: string;
let mod: typeof import('./contacts');

const linha = (sender: string, senderName: string, fromMe = false) =>
  `${JSON.stringify({ id: `${sender}-${senderName}`, timestamp: '2026-10-07T12:00:00Z', sender, senderName, fromMe })}\n`;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-contatos-'));
  await mkdir(join(tmp, 'data', 'grupo-a'), { recursive: true });
  await writeFile(join(tmp, 'data', 'grupo-a', 'messages.jsonl'), linha('111@s.whatsapp.net', 'Ana') + linha('999@s.whatsapp.net', 'Eu', true));
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  mod = await import('./contacts');
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('buildContacts com cache', () => {
  it('sem mudança nos arquivos, devolve o mesmo mapa sem reler', async () => {
    const a = await mod.buildContacts();
    const b = await mod.buildContacts();
    expect(b).toBe(a);
    expect(a.names.get('111')).toBe('Ana');
    expect(a.ownIds.has('999')).toBe(true);
  });

  it('mensagem nova num chat refaz o mapa', async () => {
    const antes = await mod.buildContacts();
    await appendFile(join(tmp, 'data', 'grupo-a', 'messages.jsonl'), linha('222@s.whatsapp.net', 'Bia'));
    const depois = await mod.buildContacts();
    expect(depois).not.toBe(antes);
    expect(depois.names.get('222')).toBe('Bia');
  });

  it('chat novo e time novo também refazem', async () => {
    await mkdir(join(tmp, 'data', 'grupo-b'), { recursive: true });
    await writeFile(join(tmp, 'data', 'grupo-b', 'messages.jsonl'), linha('333@s.whatsapp.net', 'Caio'));
    const comChat = await mod.buildContacts();
    expect(comChat.names.get('333')).toBe('Caio');
    await writeFile(join(tmp, 'data', '.team.json'), JSON.stringify(['333']));
    const comTime = await mod.buildContacts();
    expect(comTime.teamIds.has('333')).toBe(true);
  });
});
