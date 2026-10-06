import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let tmp: string;
let admin: typeof import('./admin');
let store: typeof import('./usuarios');
let senha: typeof import('./senha');
beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-admin-'));
  await mkdir(join(tmp, 'data'), { recursive: true });
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  admin = await import('./admin');
  store = await import('./usuarios');
  senha = await import('./senha');
});
afterAll(async () => rm(tmp, { recursive: true, force: true }));

describe('executar', () => {
  it('criar com senha gerada: devolve a senha uma vez e guarda só o hash', async () => {
    const r = await admin.executar({ acao: 'criar', login: 'Ana', nome: ' Ana ' }, 'operador');
    expect(r.usuario).toMatchObject({ login: 'ana', nome: 'Ana', ativo: true, versao: 1, chats: [] });
    expect(r.senhaGerada).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const u = (await store.lerUsuarios())[0]!;
    expect(await senha.verificarSenha(r.senhaGerada!, u.senha)).toBe(true);
  });
  it('recusa login inválido, repetido, igual ao do dono e senha curta', async () => {
    await expect(admin.executar({ acao: 'criar', login: 'a', nome: 'x' }, 'operador')).rejects.toThrow(/login/);
    await expect(admin.executar({ acao: 'criar', login: 'ana', nome: 'x' }, 'operador')).rejects.toThrow(/já existe/);
    await expect(admin.executar({ acao: 'criar', login: 'operador', nome: 'x' }, 'operador')).rejects.toThrow(/dono/);
    await expect(admin.executar({ acao: 'criar', login: 'bia', nome: 'x', senha: 'curta' }, 'operador')).rejects.toThrow(/8/);
  });
  it('trocar senha, desativar e apagar sobem a versão (derrubam sessões)', async () => {
    const v0 = (await store.acharUsuario('ana'))!.versao;
    await admin.executar({ acao: 'senha', login: 'ana', senha: 'nova-senha-1' }, 'operador');
    expect((await store.acharUsuario('ana'))!.versao).toBe(v0 + 1);
    await admin.executar({ acao: 'ativo', login: 'ana', ativo: false }, 'operador');
    const u = (await store.acharUsuario('ana'))!;
    expect(u.ativo).toBe(false);
    expect(u.versao).toBe(v0 + 2);
  });
  it('chats: limpa, tira repetidos e recusa slug com caractere estranho', async () => {
    await admin.executar({ acao: 'chats', login: 'ana', chats: ['grupo-a', 'grupo-a', ' dm-5511999999999 '] }, 'operador');
    expect((await store.acharUsuario('ana'))!.chats).toEqual(['grupo-a', 'dm-5511999999999']);
    await expect(admin.executar({ acao: 'chats', login: 'ana', chats: ['../x'] }, 'operador')).rejects.toThrow(/slug/);
  });
  it('conta inexistente é erro; apagar remove', async () => {
    await expect(admin.executar({ acao: 'editar', login: 'zeca', nome: 'Z' }, 'operador')).rejects.toThrow(/não existe/);
    await admin.executar({ acao: 'apagar', login: 'ana' }, 'operador');
    expect(await store.acharUsuario('ana')).toBeNull();
  });
});
