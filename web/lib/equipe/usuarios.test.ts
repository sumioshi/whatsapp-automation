import { mkdir, mkdtemp, rm, stat, utimes, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let tmp: string;
let mod: typeof import('./usuarios');
beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-equipe-'));
  await mkdir(join(tmp, 'data'), { recursive: true });
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  mod = await import('./usuarios');
});
afterAll(async () => rm(tmp, { recursive: true, force: true }));

const ana = {
  login: 'ana', nome: 'Ana', senha: 'scrypt$x$y', ativo: true, versao: 1,
  chats: ['grupo-a'], criadoEm: '2026-10-06T12:00:00.000Z', ultimoAcesso: null,
};

describe('store de contas', () => {
  it('sem arquivo → lista vazia; acharUsuario → null', async () => {
    expect(await mod.lerUsuarios()).toEqual([]);
    expect(await mod.acharUsuario('ana')).toBeNull();
  });
  it('alterarUsuarios grava e o cache enxerga a mudança', async () => {
    await mod.alterarUsuarios((l) => { l.push({ ...ana }); });
    expect((await mod.acharUsuario('ana'))?.chats).toEqual(['grupo-a']);
    await mod.alterarUsuarios((l) => { l[0]!.chats = ['grupo-b']; });
    expect((await mod.acharUsuario('ana'))?.chats).toEqual(['grupo-b']);
  });
  it('alterações concorrentes não se perdem', async () => {
    await Promise.all(
      ['bia', 'caio', 'duda'].map((login) =>
        mod.alterarUsuarios((l) => { l.push({ ...ana, login }); }),
      ),
    );
    expect((await mod.lerUsuarios()).map((u) => u.login).sort()).toEqual(['ana', 'bia', 'caio', 'duda']);
  });
  it('arquivo corrompido → ninguém entra (lista vazia), sem exceção; alterarUsuarios recusa', async () => {
    await writeFile(mod.usuariosFile(), '{não é json');
    expect(await mod.lerUsuarios()).toEqual([]);
    const conteudoOriginal = await readFile(mod.usuariosFile(), 'utf8');
    await expect(mod.alterarUsuarios((l) => { l.push({...ana, login: 'eva'}); })).rejects.toThrow(/ilegível/);
    expect(await readFile(mod.usuariosFile(), 'utf8')).toBe(conteudoOriginal);
  });
  it('publico() tira a senha', () => {
    expect('senha' in mod.publico(ana)).toBe(false);
  });
  it('cache não fica velho quando o arquivo muda por fora com o mesmo mtime', async () => {
    const f = mod.usuariosFile();
    const T = 1_790_000_000; // segundos inteiros: o mtime fica idêntico nas duas escritas
    await writeFile(f, JSON.stringify([{ ...ana, ativo: true }]));
    await utimes(f, T, T);
    expect((await mod.acharUsuario('ana'))?.ativo).toBe(true);
    await writeFile(f, JSON.stringify([{ ...ana, ativo: false, versao: 22 }]));
    await utimes(f, T, T);
    expect((await stat(f)).mtimeMs).toBe(T * 1000);
    expect((await mod.acharUsuario('ana'))?.versao).toBe(22);
  });
});
