import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// O mapa mora em DATA_DIR (resolvido no import de ./paths): fixa o env antes de importar.
let tmp: string;
let mod: typeof import('./orca-repos');

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-orca-repos-'));
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  mod = await import('./orca-repos');
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('orca-repos', () => {
  it('sem arquivo, devolve cópia da semente (sem compartilhar referência)', async () => {
    const mapa = await mod.readOrcaRepos();
    expect(mapa).toEqual(mod.ORCA_REPOS_PADRAO);
    mapa['x'] = ['y'];
    expect(mod.ORCA_REPOS_PADRAO['x']).toBeUndefined();
  });

  it('vincular grava o arquivo e põe a pasta nova na frente, sem duplicar', async () => {
    const m1 = await mod.vincularRepoOrca('grupo-teste', 'pasta-a');
    expect(m1['grupo-teste']).toEqual(['pasta-a']);

    const m2 = await mod.vincularRepoOrca('grupo-teste', 'pasta-b');
    expect(m2['grupo-teste']).toEqual(['pasta-b', 'pasta-a']);

    // mesma pasta com caixa diferente = mesma pasta
    const m3 = await mod.vincularRepoOrca('grupo-teste', 'PASTA-A');
    expect(m3['grupo-teste']).toEqual(['PASTA-A', 'pasta-b']);

    const disco = JSON.parse(await readFile(join(tmp, 'data', 'orca-repos.json'), 'utf8'));
    expect(disco['grupo-teste']).toEqual(['PASTA-A', 'pasta-b']);
    // a semente foi preservada junto
    expect(disco['projeto-128']).toEqual(['projeto-187']);
  });

  it('desvincular uma pasta mantém as outras; a última apaga o slug', async () => {
    const m1 = await mod.desvincularRepoOrca('grupo-teste', 'pasta-b');
    expect(m1['grupo-teste']).toEqual(['PASTA-A']);

    const m2 = await mod.desvincularRepoOrca('grupo-teste', 'pasta-a');
    expect(m2['grupo-teste']).toBeUndefined();

    // slug inexistente é no-op
    const m3 = await mod.desvincularRepoOrca('nao-existe', 'z');
    expect(m3['nao-existe']).toBeUndefined();
  });

  it('desvincular sem pasta apaga o vínculo inteiro', async () => {
    await mod.vincularRepoOrca('outro', 'a');
    await mod.vincularRepoOrca('outro', 'b');
    const m = await mod.desvincularRepoOrca('outro');
    expect(m['outro']).toBeUndefined();
  });

  it('recusa slug ou pasta vazios', async () => {
    await expect(mod.vincularRepoOrca('', 'a')).rejects.toThrow();
    await expect(mod.vincularRepoOrca('s', '  ')).rejects.toThrow();
    await expect(mod.desvincularRepoOrca(' ')).rejects.toThrow();
  });

  it('arquivo corrompido cai na semente; sync só grava quando muda', async () => {
    await writeFile(join(tmp, 'data', 'orca-repos.json'), '{not json', 'utf8');
    expect(await mod.readOrcaRepos()).toEqual(mod.ORCA_REPOS_PADRAO);

    expect(await mod.syncOrcaReposFromSnapshot({ a: ['1'], b: ['2', '', 3] })).toBe(true);
    expect(await mod.readOrcaRepos()).toEqual({ a: ['1'], b: ['2'] });
    expect(await mod.syncOrcaReposFromSnapshot({ a: ['1'], b: ['2'] })).toBe(false);
    expect(await mod.syncOrcaReposFromSnapshot(null)).toBe(false);
    expect(await mod.syncOrcaReposFromSnapshot(['lista'])).toBe(false);
  });
});
