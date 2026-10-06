import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('resolveOutboundMedia — materializa bytes ou reusa path', () => {
  it('grava os bytes num temp dentro do DATA_DIR e devolve o path', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'wac-data-'));
    vi.stubEnv('WAC_DATA_DIR', dataDir);
    const bytes = Buffer.from('imagem-fake-do-operador');
    const { resolveOutboundMedia } = await import('./outbound-media');
    const { abs, tmp } = await resolveOutboundMedia({ bytes });
    expect(abs.startsWith(dataDir + sep)).toBe(true);
    expect(tmp).toBe(abs);
    expect((await readFile(abs))).toEqual(bytes);
  });

  it('reusa mídia residente (absoluta ou relativa ao DATA_DIR) sem criar temp', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'wac-data-'));
    vi.stubEnv('WAC_DATA_DIR', dataDir);
    await mkdir(join(dataDir, 'grupo-a', 'image'), { recursive: true });
    const file = join(dataDir, 'grupo-a', 'image', 'ja-existe.jpg');
    await writeFile(file, Buffer.from('x'));
    const { resolveOutboundMedia } = await import('./outbound-media');
    expect(await resolveOutboundMedia({ path: file })).toEqual({ abs: file, tmp: null });
    expect(await resolveOutboundMedia({ path: 'grupo-a/image/ja-existe.jpg' })).toEqual({ abs: file, tmp: null });
  });

  it('recusa caminho que não é mídia de chat, mesmo existindo', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'wac-data-'));
    vi.stubEnv('WAC_DATA_DIR', dataDir);
    await writeFile(join(dataDir, 'api-tokens.json'), '[]');
    const { resolveOutboundMedia } = await import('./outbound-media');
    await expect(resolveOutboundMedia({ path: join(dataDir, 'api-tokens.json') })).rejects.toThrow(/não é mídia/);
    await expect(resolveOutboundMedia({ path: '/etc/hosts' })).rejects.toThrow(/não é mídia/);
  });

  it('lança "arquivo não encontrado" quando o path não existe', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'wac-data-'));
    vi.stubEnv('WAC_DATA_DIR', dataDir);
    const { resolveOutboundMedia } = await import('./outbound-media');
    await expect(resolveOutboundMedia({ path: 'grupo-a/image/nada.jpg' })).rejects.toThrow(/não encontrado/);
  });

  it('lança quando não vem nem path nem dataBase64', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'wac-data-'));
    vi.stubEnv('WAC_DATA_DIR', dataDir);
    const { resolveOutboundMedia } = await import('./outbound-media');
    await expect(resolveOutboundMedia({})).rejects.toThrow();
  });

  it('não deixa o temp escapar do DATA_DIR (fica sob .tmp-outbound)', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'wac-data-'));
    vi.stubEnv('WAC_DATA_DIR', dataDir);
    const { resolveOutboundMedia } = await import('./outbound-media');
    const { abs } = await resolveOutboundMedia({ bytes: Buffer.from('a') });
    expect(abs).toContain(`${sep}.tmp-outbound${sep}`);
    expect(existsSync(abs)).toBe(true);
  });
});
