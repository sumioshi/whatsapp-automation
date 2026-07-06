import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
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

  it('reusa um path absoluto existente sem criar temp (mediaPath residente)', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'wac-data-'));
    vi.stubEnv('WAC_DATA_DIR', dataDir);
    const file = join(dataDir, 'ja-existe.jpg');
    await writeFile(file, Buffer.from('x'));
    const { resolveOutboundMedia } = await import('./outbound-media');
    const { abs, tmp } = await resolveOutboundMedia({ path: file });
    expect(abs).toBe(file);
    expect(tmp).toBeNull();
  });

  it('lança "arquivo não encontrado" quando o path não existe', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'wac-data-'));
    vi.stubEnv('WAC_DATA_DIR', dataDir);
    const { resolveOutboundMedia } = await import('./outbound-media');
    await expect(resolveOutboundMedia({ path: '/nao/existe/nada.jpg' })).rejects.toThrow(/não encontrado/);
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
