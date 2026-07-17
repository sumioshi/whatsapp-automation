// Range de diacríticos combinantes (acentos) para normalização de slug.
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Converte um texto livre em slug seguro para nome de pasta/arquivo. */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'sem-nome';
}

/**
 * Registro de slugs estáveis por jid (vindos do groups.config.json). Vive aqui
 * — módulo neutro que coletor e mapper já importam — pra toda resolução de
 * conversa usar o slug persistido em vez de derivar do nome atual do grupo.
 */
const groupSlugOverrides = new Map<string, string>();

export function setGroupSlugOverrides(entries: ReadonlyMap<string, string>): void {
  groupSlugOverrides.clear();
  for (const [jid, slug] of entries) groupSlugOverrides.set(jid, slug);
}

/** Slug da conversa de grupo: o persistido pro jid, ou o derivado do nome. */
export function slugForGroup(jid: string, name: string): string {
  return groupSlugOverrides.get(jid) ?? slugify(name);
}

/** Timestamp ordenável: 2026-06-22_14-30-05 (hora local). */
export function timestampSlug(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const t = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `${d}_${t}`;
}

/**
 * Nome de arquivo determinístico: data_hora_remetente_tipo_id.ext.
 * O `id` (key da mensagem) garante unicidade e dedup natural.
 */
export function mediaFileName(
  date: Date,
  senderName: string,
  type: string,
  messageId: string,
  ext: string,
): string {
  const sender = slugify(senderName);
  const safeId = messageId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16) || 'noid';
  return `${timestampSlug(date)}_${sender}_${type}_${safeId}.${ext}`;
}
