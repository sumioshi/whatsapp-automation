import type { Contacts } from "./contacts";
import type { MessageView } from "./data";

/**
 * Uma DM pode existir em DOIS diretórios: `dm-<telefone>` e `dm-<lid>` (o
 * WhatsApp identifica o mesmo contato pelos dois, conforme o momento). O
 * reconciliador do coletor funde isso com o tempo, mas até lá quem lê um só
 * dos slugs perde metade da conversa. Aqui a leitura enxerga os dois.
 */

const DM = /^dm-(\d+)$/;

/** Telefone canônico de um user-part: mapeado no sidecar, ou o próprio id se não for LID. */
function telefoneDe(c: Contacts, userPart: string): string | null {
  const p = c.phones.get(userPart);
  if (p) return p;
  if (c.lids.has(userPart)) return null;
  return /^\d{8,}$/.test(userPart) ? userPart : null;
}

/**
 * Slugs de DM que são a MESMA pessoa que `slug` (telefone primeiro), limitados
 * aos que existem no coletor. Grupo, LID sem telefone conhecido ou slug sem
 * irmão devolvem só o próprio slug.
 */
export function slugsIrmaosDeDm(
  slug: string,
  c: Contacts,
  existentes: ReadonlySet<string>,
): string[] {
  const m = DM.exec(slug);
  if (!m?.[1]) return [slug];
  const tel = telefoneDe(c, m[1]);
  if (!tel) return [slug];
  const partes = new Set<string>([tel, m[1]]);
  for (const [userPart, phone] of c.phones) if (phone === tel) partes.add(userPart);
  const out = [...partes].map((p) => `dm-${p}`).filter((s) => s === slug || existentes.has(s));
  return out.length ? out : [slug];
}

/** Junta várias listas por id (sem duplicar) e ordena por timestamp. */
export function fundirMensagens(listas: MessageView[][]): MessageView[] {
  const porId = new Map<string, MessageView>();
  for (const lista of listas) for (const m of lista) if (!porId.has(m.id)) porId.set(m.id, m);
  return [...porId.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
