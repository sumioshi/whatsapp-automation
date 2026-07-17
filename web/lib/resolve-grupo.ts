import { slugify } from './slug';

/** Um grupo do groups.config.json (só os campos que importam pra resolução). */
export interface GroupRef {
  id: string; // jid '<...>@g.us'
  name: string;
  /** Slug estável persistido pelo coletor (sobrevive a renomeações). */
  slug?: string;
}

/**
 * Resolve um grupo pelo identificador que o agente passou — jid, nome exato OU
 * slug — pro jid do grupo. Função PURA (recebe a lista já carregada) pra ser
 * testável sem I/O.
 *
 * Por que slug: as tools de leitura (ler_mensagens/buscar/listar_grupos) usam
 * slug (nome da pasta em data/), então é natural o agente passar slug no
 * responder também. O config tem id+name mas NÃO slug, então slugificamos o name
 * pra casar. Sem isso, responder({grupo:"acme-corp"}) ou qualquer grupo com
 * nome acentuado/emoji/multi-palavra falharia silencioso — só colava por
 * "near-miss" quando o slug era idêntico ao nome exato.
 */
export function matchGrupo(grupo: string, groups: GroupRef[]): GroupRef | null {
  const g = grupo.trim();
  // 1) id (jid) ou nome EXATO.
  const exact = groups.find((x) => x.id === g || x.name === g);
  if (exact) return exact;
  // 2) slug — o persistido (estável em rename) OU o derivado do nome atual.
  const wanted = slugify(g);
  return groups.find((x) => x.slug === wanted || slugify(x.name) === wanted) ?? null;
}

/** Slug canônico de um grupo resolvido: o persistido, ou o derivado do nome. */
export function canonicalSlug(ref: GroupRef): string {
  return ref.slug ?? slugify(ref.name);
}
