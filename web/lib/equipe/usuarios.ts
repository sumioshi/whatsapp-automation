import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from '../json-store';
import { DATA_DIR } from '../paths';

/** Conta de atendente. O dono não mora aqui: é PANEL_USER/PANEL_PASS. */
export interface Usuario {
  login: string;
  nome: string;
  /** "scrypt$<sal>$<hash>". */
  senha: string;
  ativo: boolean;
  /** Sobe ao desativar, trocar senha ou apagar: invalida as sessões abertas. */
  versao: number;
  /** Slugs liberados. */
  chats: string[];
  criadoEm: string;
  ultimoAcesso: string | null;
}

export type UsuarioPublico = Omit<Usuario, 'senha'>;

export const LOGIN_RE = /^[a-z0-9._-]{2,32}$/;

export function usuariosFile(): string {
  return join(DATA_DIR, '.equipe', 'usuarios.json');
}

export function publico(u: Usuario): UsuarioPublico {
  const { senha: _senha, ...resto } = u;
  return resto;
}

function valido(x: unknown): x is Usuario {
  const u = x as Usuario;
  return (
    !!u && typeof u.login === 'string' && typeof u.senha === 'string' &&
    typeof u.ativo === 'boolean' && typeof u.versao === 'number' && Array.isArray(u.chats)
  );
}

/** Arquivo ausente ou ilegível → ninguém da equipe entra (falha fechada). */
export async function lerUsuarios(): Promise<Usuario[]> {
  try {
    const parsed = JSON.parse(await readFile(usuariosFile(), 'utf8')) as unknown;
    return Array.isArray(parsed) ? parsed.filter(valido) : [];
  } catch {
    return [];
  }
}

/** Leitura rigorosa para alterações: ENOENT → []; erro ou não-array → throw. */
async function lerUsuariosStrict(): Promise<Usuario[]> {
  try {
    const parsed = JSON.parse(await readFile(usuariosFile(), 'utf8')) as unknown;
    if (!Array.isArray(parsed)) throw new Error('não é array');
    return parsed.filter(valido);
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return [];
    throw new Error('arquivo de contas ilegível — corrija antes de alterar');
  }
}

let cache: { chave: string; lista: Usuario[] } | null = null;

/**
 * Leitura quente do proxy: relê só quando o arquivo muda. A chave junta mtime,
 * tamanho e inode — o mtime sozinho pode repetir (resolução do sistema de
 * arquivos, cópia que preserva data) e a escrita atômica troca o inode.
 */
export async function acharUsuario(login: string): Promise<Usuario | null> {
  let chave: string;
  try {
    const s = await stat(usuariosFile());
    chave = `${s.mtimeMs}:${s.size}:${s.ino}`;
  } catch {
    cache = null;
    return null;
  }
  if (!cache || cache.chave !== chave) cache = { chave, lista: await lerUsuarios() };
  return cache.lista.find((u) => u.login === login) ?? null;
}

let fila: Promise<unknown> = Promise.resolve();

/** Lê, aplica `fn` na lista e grava — uma alteração por vez. */
export function alterarUsuarios<T>(fn: (lista: Usuario[]) => T | Promise<T>): Promise<T> {
  const passo = fila.then(async () => {
    const lista = await lerUsuariosStrict();
    const r = await fn(lista);
    await writeJsonAtomic(usuariosFile(), lista);
    cache = null;
    return r;
  });
  fila = passo.catch(() => {});
  return passo;
}
