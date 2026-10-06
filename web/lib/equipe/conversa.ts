import { type MessageView, readGroupMessages, readGroupRecords } from '../data';
import { fundirMensagens } from '../dm-irmaos';

interface Leitor {
  registros(slug: string): Promise<Array<{ id: string; timestamp: string }>>;
  mensagens(slug: string, o: { limit: number; before?: string }): Promise<MessageView[]>;
}

const PADRAO: Leitor = { registros: readGroupRecords, mensagens: readGroupMessages };

/**
 * Janela de mensagens de uma conversa que pode estar em vários slugs (DM
 * partida em telefone × LID). Com um slug só, é a leitura de sempre. Com
 * irmãos, cada um contribui com as suas últimas `limit` antes do corte, as
 * listas são fundidas por id e ficam as últimas `limit` por timestamp. O
 * `before` (id) vira corte de tempo: no irmão que tem a âncora vale o id, nos
 * outros vale o timestamp dela. Âncora em nenhum irmão = fim da paginação.
 */
export async function janelaDaConversa(
  slugs: string[],
  o: { limit: number; before?: string },
  ler: Leitor = PADRAO,
): Promise<MessageView[]> {
  if (slugs.length <= 1) return ler.mensagens(slugs[0] ?? '', o);
  const registros = new Map<string, Array<{ id: string; timestamp: string }>>();
  await Promise.all(slugs.map(async (s) => registros.set(s, await ler.registros(s))));

  let corte: string | null = null;
  let dono: string | null = null;
  if (o.before) {
    for (const s of slugs) {
      const r = registros.get(s)?.find((x) => x.id === o.before);
      if (r) {
        corte = r.timestamp;
        dono = s;
        break;
      }
    }
    if (!corte) return [];
  }

  const listas = await Promise.all(
    slugs.map(async (s) => {
      if (!corte || s === dono) return ler.mensagens(s, o);
      const rs = registros.get(s) ?? [];
      const idx = rs.findIndex((x) => x.timestamp >= (corte as string));
      if (idx === 0) return [];
      return ler.mensagens(s, idx < 0 ? { limit: o.limit } : { limit: o.limit, before: rs[idx]?.id });
    }),
  );
  return fundirMensagens(listas).slice(-o.limit);
}

/** Total de mensagens únicas da conversa (mesmo id em dois irmãos conta uma vez). */
export async function totalDaConversa(slugs: string[], ler: Pick<Leitor, 'registros'> = PADRAO): Promise<number> {
  if (slugs.length <= 1) return (await ler.registros(slugs[0] ?? '')).length;
  const ids = new Set<string>();
  for (const rs of await Promise.all(slugs.map((s) => ler.registros(s)))) for (const r of rs) ids.add(r.id);
  return ids.size;
}
