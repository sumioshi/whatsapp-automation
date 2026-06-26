import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DATA_DIR é resolvido no carregamento de ./paths a partir de WAC_DATA_DIR. Por isso
// setamos a env e só então importamos ./links dinamicamente — assim o índice central
// cai num tmp, nunca no data/ real.
let tmp: string;
let mod: typeof import('./links');

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-links-'));
  await mkdir(join(tmp, 'data'), { recursive: true });
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  mod = await import('./links');
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

/** Cria um diretório de "repo do cliente" dentro do tmp e devolve o caminho. */
async function makeRepo(name: string): Promise<string> {
  const dir = join(tmp, name);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe('índice central (links.json)', () => {
  it('readLinks vazio retorna {}', async () => {
    expect(await mod.readLinks()).toEqual({});
  });

  it('writeLink + readLinks faz roundtrip e é idempotente', async () => {
    const repo = await makeRepo('repo-a');
    const entry = { repoPath: repo, cliente: 'Cliente A', tipo: 'projeto' as const, notas: 'x' };
    await mod.writeLink('grupo-a', entry);
    await mod.writeClientFiles('grupo-a', entry); // só pra não deixar repoPath órfão
    expect((await mod.readLinks())['grupo-a']).toEqual(entry);

    await mod.writeLink('grupo-a', entry);
    expect(Object.keys(await mod.readLinks())).toEqual(['grupo-a']);
  });

  it('removeLink tira do índice sem afetar os outros', async () => {
    const repo = await makeRepo('repo-b');
    const entry = { repoPath: repo, cliente: 'B', tipo: 'dm' as const, notas: '' };
    await mod.writeClientFiles('dm-99', entry);
    await mod.writeLink('dm-99', entry);
    await mod.removeLink('grupo-a');
    const links = await mod.readLinks();
    expect(links['grupo-a']).toBeUndefined();
    expect(links['dm-99']).toEqual(entry);
  });
});

describe('lado do repo do cliente', () => {
  it('escreve .claude/whatsapp.json com grupo=slug', async () => {
    const repo = await makeRepo('repo-c');
    await mod.writeClientFiles('dm-123', {
      repoPath: repo,
      cliente: 'Faanz',
      tipo: 'dm',
      notas: 'app iOS',
    });
    const raw = JSON.parse(await readFile(join(repo, '.claude', 'whatsapp.json'), 'utf8'));
    expect(raw).toEqual({ grupo: 'dm-123', cliente: 'Faanz', tipo: 'dm', notas: 'app iOS' });
  });

  it('injeta o bloco no CLAUDE.md preservando o conteúdo e sem duplicar', async () => {
    const repo = await makeRepo('repo-d');
    await writeFile(join(repo, 'CLAUDE.md'), '# Projeto D\n\ninstruções existentes\n', 'utf8');

    await mod.writeClientFiles('dm-1', { repoPath: repo, cliente: 'D', tipo: 'dm', notas: '' });
    let md = await readFile(join(repo, 'CLAUDE.md'), 'utf8');
    expect(md).toContain('# Projeto D');
    expect(md).toContain('instruções existentes');
    expect(md).toContain('dm-1');
    expect(md.match(/wa-link:start/g)).toHaveLength(1);

    // Re-linkar (outro slug) faz upsert: continua 1 bloco só, com o slug novo.
    await mod.writeClientFiles('dm-2', { repoPath: repo, cliente: 'D', tipo: 'dm', notas: '' });
    md = await readFile(join(repo, 'CLAUDE.md'), 'utf8');
    expect(md.match(/wa-link:start/g)).toHaveLength(1);
    expect(md).toContain('dm-2');
    expect(md).not.toContain('dm-1');
    expect(md).toContain('instruções existentes');
  });

  it('cria CLAUDE.md do zero quando não existe', async () => {
    const repo = await makeRepo('repo-e');
    await mod.writeClientFiles('grupo-x', { repoPath: repo, cliente: 'E', tipo: 'grupo', notas: '' });
    const md = await readFile(join(repo, 'CLAUDE.md'), 'utf8');
    expect(md).toContain('wa-link:start');
    expect(md).toContain('grupo-x');
  });

  it('rejeita repoPath relativo ou inexistente', async () => {
    await expect(
      mod.writeClientFiles('s', { repoPath: 'relativo/x', cliente: '', tipo: 'projeto', notas: '' }),
    ).rejects.toThrow(/absoluto/);
    await expect(
      mod.writeClientFiles('s', {
        repoPath: join(tmp, 'nao-existe'),
        cliente: '',
        tipo: 'projeto',
        notas: '',
      }),
    ).rejects.toThrow(/não existe/);
  });
});
