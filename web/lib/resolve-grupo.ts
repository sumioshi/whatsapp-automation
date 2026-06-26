import { slugify } from './slug';

/** Um grupo do groups.config.json (só os campos que importam pra resolução). */
export interface GroupRef {
  id: string; // jid '<...>@g.us'
  name: string;
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
  // 2) slug (name slugificado).
  const wanted = slugify(g);
  return groups.find((x) => slugify(x.name) === wanted) ?? null;
}
