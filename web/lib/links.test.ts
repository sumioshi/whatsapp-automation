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

// ── indexar sem tocar no repo do cliente ─────────────────────────────────────
// O painel roda na nuvem: o repo do operador não existe no filesystem do
// container. Indexar o link não pode depender de escrever nesse repo.
describe('writeClientFiles vs índice', () => {
  it('recusa repoPath que não existe neste servidor', async () => {
    const { writeClientFiles } = await import('./links');
    await expect(
      writeClientFiles('acme', {
        repoPath: '/caminho/que/nao/existe/aqui',
        cliente: 'Acme',
        tipo: 'projeto',
        notas: '',
      }),
    ).rejects.toThrow(/não existe/);
  });

  it('escreve os arquivos quando o repo existe de verdade', async () => {
    const { writeClientFiles } = await import('./links');
    const repo = await mkdtemp(join(tmpdir(), 'wac-repo-'));
    await writeClientFiles('acme-chat', {
      repoPath: repo,
      cliente: 'Acme',
      tipo: 'grupo',
      notas: 'teste',
    });
    const cfg = JSON.parse(await readFile(join(repo, '.claude/whatsapp.json'), 'utf8'));
    expect(cfg.grupo).toBe('acme-chat');
    expect(await readFile(join(repo, 'CLAUDE.md'), 'utf8')).toContain('acme-chat');
  });
});

// ── vínculo com repositório GitHub ───────────────────────────────────────────
// O agente de triagem que roda no GitHub precisa saber owner/repo (pra abrir
// issues) e brainDir (pra achar a memória do Claude Code do projeto).
describe('githubValido', () => {
  it('aceita owner/repo com ponto, hífen e underscore', () => {
    expect(mod.githubValido('Org-Exemplo/app-exemplo')).toBe(true);
    expect(mod.githubValido('org/repo.name_x')).toBe(true);
  });
  it('recusa url, barra a mais e vazio', () => {
    expect(mod.githubValido('https://github.com/o/r')).toBe(false);
    expect(mod.githubValido('o/r/x')).toBe(false);
    expect(mod.githubValido('')).toBe(false);
  });
});

describe('brainDirDe', () => {
  it('troca tudo que não é letra, dígito ou hífen por hífen (encoding do Claude Code)', () => {
    expect(mod.brainDirDe('/Users/x/projetos/projeto-145')).toBe('-Users-x-projetos-projeto-145');
    expect(mod.brainDirDe('/a/b.c')).toBe('-a-b-c');
  });
});

describe('writeLink / readLinks com github', () => {
  it('preserva github e brainDir na leitura e ignora github inválido', async () => {
    await mod.writeLink('g1', {
      repoPath: '/Users/x/p/g1', cliente: 'G1', tipo: 'grupo', notas: '',
      github: 'org/g1', brainDir: '-Users-x-p-g1',
    });
    await mod.writeLink('g2', {
      repoPath: '/Users/x/p/g2', cliente: 'G2', tipo: 'grupo', notas: '',
      github: 'nao-e-um-repo',
    });
    const links = await mod.readLinks();
    expect(links.g1?.github).toBe('org/g1');
    expect(links.g1?.brainDir).toBe('-Users-x-p-g1');
    expect(links.g2?.github).toBeUndefined();
  });
});

// ── mesclarLink: POST não pode apagar github/brainDir por omissão ──────────
// A rota /api/links recebe um corpo parcial a cada edição (ex: só trocar as
// notas). Sem essa regra, reenviar o form sem o campo github apagaria o
// vínculo com o repositório — e junto o agente de triagem, que depende dele.
describe('mesclarLink', () => {
  it('novo sem github mantém o github antigo', () => {
    const existente = { repoPath: '/r', cliente: 'C', tipo: 'grupo' as const, notas: '', github: 'org/repo' };
    const novo = { repoPath: '/r', cliente: 'C', tipo: 'grupo' as const, notas: 'nota nova' };
    const resultado = mod.mesclarLink(existente, novo, false);
    expect(resultado.github).toBe('org/repo');
    expect(resultado.notas).toBe('nota nova');
  });

  it('github informado substitui o antigo', () => {
    const existente = { repoPath: '/r', cliente: 'C', tipo: 'grupo' as const, notas: '', github: 'org/repo-velho' };
    const novo = { repoPath: '/r', cliente: 'C', tipo: 'grupo' as const, notas: '', github: 'org/repo-novo' };
    const resultado = mod.mesclarLink(existente, novo, true);
    expect(resultado.github).toBe('org/repo-novo');
  });

  it('repoPath igual mantém o brainDir existente (não recomputa)', () => {
    const existente = {
      repoPath: '/r', cliente: 'C', tipo: 'grupo' as const, notas: '', brainDir: '-brain-manual',
    };
    const novo = { repoPath: '/r', cliente: 'C', tipo: 'grupo' as const, notas: '' };
    const resultado = mod.mesclarLink(existente, novo, false);
    expect(resultado.brainDir).toBe('-brain-manual');
  });

  it('repoPath diferente recomputa o brainDir', () => {
    const existente = {
      repoPath: '/velho', cliente: 'C', tipo: 'grupo' as const, notas: '', brainDir: '-velho',
    };
    const novo = { repoPath: '/novo/caminho', cliente: 'C', tipo: 'grupo' as const, notas: '' };
    const resultado = mod.mesclarLink(existente, novo, false);
    expect(resultado.brainDir).toBe(mod.brainDirDe('/novo/caminho'));
  });

  it('sem existente calcula o brainDir a partir do repoPath do novo', () => {
    const novo = { repoPath: '/a/b', cliente: 'C', tipo: 'grupo' as const, notas: '' };
    const resultado = mod.mesclarLink(undefined, novo, false);
    expect(resultado.brainDir).toBe(mod.brainDirDe('/a/b'));
    expect(resultado.github).toBeUndefined();
  });
});
