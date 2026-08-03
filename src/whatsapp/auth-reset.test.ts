import { access, mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { archiveAuthDir } from './auth-reset.js';

async function makeAuthDir(): Promise<{ base: string; authDir: string }> {
  const base = await mkdtemp(join(tmpdir(), 'wac-auth-reset-'));
  const authDir = join(base, 'auth');
  await mkdir(authDir);
  await writeFile(join(authDir, 'creds.json'), '{"registered":true}', 'utf8');
  return { base, authDir };
}

describe('archiveAuthDir', () => {
  it('move o diretório para um backup e remove o original', async () => {
    const { authDir } = await makeAuthDir();

    const backup = await archiveAuthDir(authDir);

    expect(backup).toBeTruthy();
    await expect(access(authDir)).rejects.toThrow();
    const files = await readdir(backup as string);
    expect(files).toContain('creds.json');
  });

  it('retorna null quando o diretório não existe', async () => {
    const base = await mkdtemp(join(tmpdir(), 'wac-auth-reset-'));

    const backup = await archiveAuthDir(join(base, 'auth'));

    expect(backup).toBeNull();
  });

  it('não colide quando arquivado mais de uma vez', async () => {
    const { authDir } = await makeAuthDir();

    const primeiro = await archiveAuthDir(authDir);
    await mkdir(authDir);
    await writeFile(join(authDir, 'creds.json'), '{}', 'utf8');
    const segundo = await archiveAuthDir(authDir);

    expect(primeiro).toBeTruthy();
    expect(segundo).toBeTruthy();
    expect(segundo).not.toBe(primeiro);
    await expect(access(authDir)).rejects.toThrow();
  });
});
