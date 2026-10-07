import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let tmp: string;
let admin: typeof import('./admin');
let store: typeof import('./usuarios');
let senha: typeof import('./senha');
let visto: typeof import('./visto');
let autenticar: typeof import('./autenticar');
let sessao: typeof import('./sessao');
beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-admin-'));
  await mkdir(join(tmp, 'data'), { recursive: true });
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  admin = await import('./admin');
  store = await import('./usuarios');
  senha = await import('./senha');
  visto = await import('./visto');
  autenticar = await import('./autenticar');
  sessao = await import('./sessao');
});
afterAll(async () => rm(tmp, { recursive: true, force: true }));

describe('executar', () => {
  it('criar com senha gerada: devolve a senha uma vez e guarda só o hash', async () => {
    const r = await admin.executar({ acao: 'criar', login: 'Ana', nome: ' Ana ' }, 'operador');
    expect(r.usuario).toMatchObject({ login: 'ana', nome: 'Ana', ativo: true, chats: [] });
    expect(r.usuario?.versao).toBeGreaterThan(1);
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

  it('conta recriada com o mesmo login não herda sessão nem visto da apagada', async () => {
    const cred = { user: 'operador', pass: 'x' };
    const CHAVE = 'k';
    const velha = (await admin.executar({ acao: 'criar', login: 'caio', nome: 'Caio', senha: 'senha-velha-1' }, 'operador')).usuario!;
    const tokenVelho = sessao.assinarSessao(sessao.novaSessao('caio', 'atendente', velha.versao), CHAVE);
    expect(await autenticar.quemPelaSessao(tokenVelho, cred, store.acharUsuario, CHAVE)).toEqual({ papel: 'atendente', login: 'caio' });
    await visto.marcarVisto('caio', 'grupo-a', '2026-10-06T12:00:00.000Z');

    await admin.executar({ acao: 'apagar', login: 'caio' }, 'operador');
    const arquivoVisto = join(tmp, 'data', '.equipe', 'visto-caio.json');
    await expect(access(arquivoVisto)).rejects.toThrow();

    const nova = (await admin.executar({ acao: 'criar', login: 'caio', nome: 'Caio', senha: 'senha-nova-12' }, 'operador')).usuario!;
    expect(nova.versao).not.toBe(velha.versao);
    expect(await autenticar.quemPelaSessao(tokenVelho, cred, store.acharUsuario, CHAVE)).toBeNull();
    expect(await visto.lerVisto('caio')).toEqual({});
  });
  it('falha ao remover o visto depois de apagar a conta não vira erro', async () => {
    await admin.executar({ acao: 'criar', login: 'eli', nome: 'Eli' }, 'operador');
    const caminho = join(tmp, 'data', '.equipe', 'visto-eli.json');
    await mkdir(join(caminho, 'x'), { recursive: true });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(admin.executar({ acao: 'apagar', login: 'eli' }, 'operador')).resolves.toEqual({});
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
    expect(await store.acharUsuario('eli')).toBeNull();
  });
  it('apagar conta sem visto gravado não é erro', async () => {
    await admin.executar({ acao: 'criar', login: 'davi', nome: 'Davi' }, 'operador');
    await expect(admin.executar({ acao: 'apagar', login: 'davi' }, 'operador')).resolves.toEqual({});
  });
});

describe('executar: corpo vindo da rede', () => {
  const recusa = (c: unknown) => expect(admin.executar(c as never, 'operador')).rejects.toThrow('comando inválido');

  it('recusa o que não é objeto, ação desconhecida e login que não é texto', async () => {
    await recusa(null);
    await recusa('criar');
    await recusa([]);
    await recusa({ acao: 'formatar', login: 'eva' });
    await recusa({ acao: 'criar', login: 7, nome: 'Eva' });
    await recusa({ acao: 'apagar' });
  });
  it('recusa campo de ação com tipo errado', async () => {
    await recusa({ acao: 'criar', login: 'eva', nome: 3 });
    await recusa({ acao: 'criar', login: 'eva', nome: 'Eva', senha: 12345678 });
    await recusa({ acao: 'editar', login: 'eva', nome: null });
    await recusa({ acao: 'senha', login: 'eva', senha: { a: 1 } });
    await recusa({ acao: 'ativo', login: 'eva', ativo: 'false' });
    await recusa({ acao: 'chats', login: 'eva', chats: 'grupo-a' });
    await recusa({ acao: 'chats', login: 'eva', chats: ['grupo-a', 3] });
    expect(await store.acharUsuario('eva')).toBeNull();
  });
});
