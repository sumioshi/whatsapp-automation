import { cache } from 'react';
import { type GroupSummary, listGroups } from '../data';
import { type Atendente, atendenteDaPagina, canonicoDoAtendente } from './acesso';
import { listaDoAtendente } from './lista';
import { lerVisto } from './visto';

export interface PaginaDoAtendente {
  a: Atendente;
  /** Slug canônico de cada chat liberado (DM partida vira um só). */
  canonicoDe: (slug: string) => string;
}

/** Sessão e agrupamento da área, uma vez por renderização (layout e página dividem). */
export const paginaDoAtendente = cache(async (): Promise<PaginaDoAtendente | null> => {
  const a = await atendenteDaPagina();
  if (!a) return null;
  return { a, canonicoDe: await canonicoDoAtendente(a) };
});

/** Lista da sidebar, com o não lido do atendente; a conversa tira o nome daqui. */
export const listaDaPagina = cache(async (): Promise<GroupSummary[] | null> => {
  const p = await paginaDoAtendente();
  if (!p) return null;
  const grupos = await listGroups({ lastSeen: await lerVisto(p.a.usuario.login) });
  return listaDoAtendente(grupos, p.a.chats, p.canonicoDe);
});
