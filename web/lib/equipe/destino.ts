import { readGroupsConfig } from '../config';
import { type Contacts, sendableDmJid } from '../contacts';
import { readGroupRecords } from '../data';
import { canonicalSlug, type GroupRef } from '../resolve-grupo';
import { contatosDeIdentidade } from './identidade';

interface Deps {
  contatos(): Promise<Contacts>;
  grupos(): Promise<GroupRef[]>;
  /** Registros gravados no diretório do chat. */
  registros(slug: string): Promise<Array<{ groupJid: string; timestamp: string }>>;
}

const PADRAO: Deps = { contatos: contatosDeIdentidade, grupos: readGroupsConfig, registros: readGroupRecords };

/**
 * Jid de envio a partir do slug — o atendente nunca informa número nem jid.
 * DM: mesma regra do MCP (LID vira o telefone conhecido). Grupo: o jid de
 * grupo do registro mais novo gravado no próprio diretório (a identidade do
 * chat, como no composer do dono); o slug derivado do nome pode coincidir com
 * outro grupo. Só sem registros vale o groups.config, pelo slug persistido ou
 * derivado; se mais de um grupo tiver esse slug, nada sai.
 */
export async function destinoDoSlug(slug: string, deps: Deps = PADRAO): Promise<string | null> {
  const dm = /^dm-(\d+)$/.exec(slug);
  if (dm?.[1]) return sendableDmJid(await deps.contatos(), dm[1]);
  let novo: { groupJid: string; timestamp: string } | null = null;
  for (const r of await deps.registros(slug)) {
    if (r.groupJid?.endsWith('@g.us') && (!novo || r.timestamp > novo.timestamp)) novo = r;
  }
  if (novo) return novo.groupJid;
  const ids = (await deps.grupos()).filter((g) => canonicalSlug(g) === slug).map((g) => g.id);
  return ids.length === 1 ? (ids[0] ?? null) : null;
}
