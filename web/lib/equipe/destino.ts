import { readGroupsConfig } from '../config';
import { buildContacts, type Contacts, sendableDmJid } from '../contacts';
import { canonicalSlug, type GroupRef } from '../resolve-grupo';

interface Deps {
  contatos(): Promise<Contacts>;
  grupos(): Promise<GroupRef[]>;
}

const PADRAO: Deps = { contatos: buildContacts, grupos: readGroupsConfig };

/**
 * Jid de envio a partir do slug — o atendente nunca informa número nem jid.
 * DM: mesma regra do MCP (LID vira o telefone conhecido). Grupo: groups.config
 * pelo slug persistido (estável em rename) ou derivado do nome.
 */
export async function destinoDoSlug(slug: string, deps: Deps = PADRAO): Promise<string | null> {
  const dm = /^dm-(\d+)$/.exec(slug);
  if (dm?.[1]) return sendableDmJid(await deps.contatos(), dm[1]);
  const achado = (await deps.grupos()).find((g) => canonicalSlug(g) === slug);
  return achado?.id ?? null;
}
