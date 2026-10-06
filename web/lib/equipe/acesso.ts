import { readdir } from 'node:fs/promises';
import { cookies } from 'next/headers';
import { buildContacts, type Contacts } from '../contacts';
import { slugsIrmaosDeDm } from '../dm-irmaos';
import { DATA_DIR } from '../paths';
import { cookieDe, credenciaisDoDono } from './autenticar';
import { chaveDeSessao, lerSessao, SESSION_COOKIE } from './sessao';
import { acharUsuario, type Usuario } from './usuarios';

export class ErroHttp extends Error {
  constructor(
    public status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export interface Atendente {
  usuario: Usuario;
  /** Slugs liberados já com os irmãos de DM (telefone × LID). */
  chats: Set<string>;
}

/** O WhatsApp às vezes parte o privado da mesma pessoa em telefone e LID: os dois valem. */
export function chatsEfetivos(chats: string[], c: Contacts, existentes: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const slug of chats) for (const s of slugsIrmaosDeDm(slug, c, existentes)) out.add(s);
  for (const slug of chats) out.add(slug);
  return out;
}

/** Slugs da mesma conversa (DM partida em telefone × LID) que o atendente pode ver, o próprio incluído. */
export function irmaosPermitidos(
  chats: ReadonlySet<string>,
  slug: string,
  c: Contacts,
  existentes: ReadonlySet<string>,
): string[] {
  const out = slugsIrmaosDeDm(slug, c, existentes).filter((s) => s === slug || chats.has(s));
  return out.includes(slug) ? out : [slug, ...out];
}

async function slugsExistentes(): Promise<Set<string>> {
  try {
    const entries = await readdir(DATA_DIR, { withFileTypes: true });
    return new Set(entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name));
  } catch {
    return new Set();
  }
}

async function atendentePeloToken(token: string | undefined): Promise<Atendente | null> {
  const cred = credenciaisDoDono();
  const chave = chaveDeSessao();
  if (!cred || !chave || !token) return null;
  const s = lerSessao(token, chave);
  if (!s || s.p !== 'atendente') return null;
  const usuario = await acharUsuario(s.u);
  if (!usuario || !usuario.ativo || usuario.versao !== s.v) return null;
  const temDm = usuario.chats.some((c) => c.startsWith('dm-'));
  const chats = temDm
    ? chatsEfetivos(usuario.chats, await buildContacts(), await slugsExistentes())
    : new Set(usuario.chats);
  return { usuario, chats };
}

/** Rotas da área revalidam a sessão por conta própria (não confiam só no proxy). */
export async function atendenteDoPedido(req: Request): Promise<Atendente> {
  const a = await atendentePeloToken(cookieDe(req.headers.get('cookie'), SESSION_COOKIE));
  if (!a) throw new ErroHttp(401, 'Autenticação necessária.');
  return a;
}

export async function atendenteDaPagina(): Promise<Atendente | null> {
  return atendentePeloToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** `irmaosPermitidos` com contatos e diretórios do coletor; grupo não paga a leitura. */
export async function irmaosLiberados(a: Atendente, slug: string): Promise<string[]> {
  if (!/^dm-\d+$/.test(slug)) return [slug];
  return irmaosPermitidos(a.chats, slug, await buildContacts(), await slugsExistentes());
}

/** Chat fora da lista responde como inexistente. */
export function exigirChat(a: Atendente, slug: string): void {
  if (!a.chats.has(slug)) throw new ErroHttp(404, 'não encontrado');
}

export function respostaDeErro(e: unknown): Response {
  if (e instanceof ErroHttp) return Response.json({ error: e.message }, { status: e.status });
  console.error('[atendimento]', e);
  return Response.json({ error: 'erro interno' }, { status: 500 });
}
