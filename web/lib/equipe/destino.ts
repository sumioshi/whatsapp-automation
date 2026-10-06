import { readGroupsConfig } from '../config';
import { buildContacts, type Contacts, sendableDmJid } from '../contacts';
import { readGroupRecords } from '../data';
import { canonicalSlug, type GroupRef } from '../resolve-grupo';

interface Deps {
  contatos(): Promise<Contacts>;
  grupos(): Promise<GroupRef[]>;
  /** Registros do chat (só consultados quando o slug casa com mais de um grupo). */
  registros(slug: string): Promise<Array<{ groupJid: string; timestamp: string }>>;
}

const PADRAO: Deps = { contatos: buildContacts, grupos: readGroupsConfig, registros: readGroupRecords };

/**
 * Jid de envio a partir do slug — o atendente nunca informa número nem jid.
 * DM: mesma regra do MCP (LID vira o telefone conhecido). Grupo: groups.config
 * pelo slug persistido (estável em rename) ou derivado do nome. Se mais de um
 * grupo tiver o mesmo slug, vale o do registro mais novo gravado no chat; sem
 * isso não há como saber qual é, e nada sai.
 */
export async function destinoDoSlug(slug: string, deps: Deps = PADRAO): Promise<string | null> {
  const dm = /^dm-(\d+)$/.exec(slug);
  if (dm?.[1]) return sendableDmJid(await deps.contatos(), dm[1]);
  const ids = (await deps.grupos()).filter((g) => canonicalSlug(g) === slug).map((g) => g.id);
  if (ids.length <= 1) return ids[0] ?? null;
  let novo: { groupJid: string; timestamp: string } | null = null;
  for (const r of await deps.registros(slug)) if (!novo || r.timestamp > novo.timestamp) novo = r;
  return novo && ids.includes(novo.groupJid) ? novo.groupJid : null;
}
