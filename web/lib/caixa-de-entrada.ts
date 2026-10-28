import { basename } from 'node:path';
import { buildContacts, numberFromJid, roleOf, type Contacts } from './contacts';
import { type GroupSummary, listGroups, readGroupRecords } from './data';
import { buildInbox, type InboxItem } from './inbox';
import { type LinksMap, readLinks } from './links';
import { readTriage } from './triage';

/**
 * Caixa de entrada consultável de fora (MCP, Hub, resumo agendado): quem está
 * esperando resposta e de qual projeto, sem abrir o WhatsApp. Só lê: não marca
 * visto nem avança checkpoint de ninguém. O "quem espera" é o mesmo da fila do
 * painel (`buildInbox`); aqui entram o projeto do `links.json` e o modo "tudo
 * que se mexeu desde X".
 */

export interface ProjetoDoChat {
  cliente: string;
  /** Nome da pasta do repositório (o que o Hub de projetos usa). */
  repo: string;
  github: string | null;
}

export interface EsperaDoChat {
  motivo: 'cliente_esperando' | 'mencao';
  de: string;
  previa: string;
  desde: string;
  ha: string;
  faixa: InboxItem['band'];
}

export interface ItemCaixaEntrada {
  grupo: string;
  nome: string;
  projeto: ProjetoDoChat | null;
  /** null = ninguém esperando resposta nesse chat. */
  esperando: EsperaDoChat | null;
  /** Mensagens de cliente desde `desde` (só no modo todos). */
  do_cliente_desde: number | null;
  ultima: { previa: string | null; quando: string | null };
}

export interface CaixaEntrada {
  modo: 'pendentes' | 'todos';
  desde: string | null;
  total: number;
  itens: ItemCaixaEntrada[];
}

export interface OpcoesCaixa {
  /** false (default) = só quem espera resposta; true = também o que se mexeu desde `desde`. */
  todos?: boolean;
  /** ISO; só vale no modo todos. */
  desde?: string;
  /** Restringe a estes chats. */
  grupos?: string[];
}

export function projetoDe(links: LinksMap, slug: string): ProjetoDoChat | null {
  const l = links[slug];
  if (!l) return null;
  return { cliente: l.cliente, repo: basename(l.repoPath), github: l.github || null };
}

function paraEspera(i: InboxItem): EsperaDoChat {
  return {
    motivo: i.reason === 'mentioned' ? 'mencao' : 'cliente_esperando',
    de: i.who,
    previa: i.preview,
    desde: i.waitingSince,
    ha: i.waitingLabel,
    faixa: i.band,
  };
}

/** Quantas mensagens de cliente o chat recebeu desde um instante. */
export function contarDoCliente(
  msgs: Array<{ timestamp: string; fromMe?: boolean; sender: string }>,
  desde: string,
  contacts: Contacts,
): number {
  let n = 0;
  for (const m of msgs) {
    if (m.timestamp < desde || m.fromMe) continue;
    if (roleOf(contacts, numberFromJid(m.sender)) === 'client') n++;
  }
  return n;
}

/**
 * Junta a fila de espera com a lista de chats. Pendentes vêm primeiro, na
 * ordem da fila (quem espera há mais tempo no topo); no modo todos, os chats
 * só movimentados seguem pela última atividade.
 */
export function montarCaixa(
  inbox: InboxItem[],
  grupos: GroupSummary[],
  links: LinksMap,
  movimentados: Map<string, number> | null,
): ItemCaixaEntrada[] {
  const porSlug = new Map(grupos.map((g) => [g.slug, g]));
  const item = (slug: string, nome: string, espera: InboxItem | null): ItemCaixaEntrada => {
    const g = porSlug.get(slug);
    return {
      grupo: slug,
      nome: g?.name ?? nome,
      projeto: projetoDe(links, slug),
      esperando: espera ? paraEspera(espera) : null,
      do_cliente_desde: movimentados ? (movimentados.get(slug) ?? 0) : null,
      ultima: { previa: g?.lastPreview ?? null, quando: g?.lastTimestamp ?? null },
    };
  };

  const itens = inbox.map((i) => item(i.slug, i.groupName, i));
  if (!movimentados) return itens;

  const jaListados = new Set(inbox.map((i) => i.slug));
  const resto = grupos
    .filter((g) => !jaListados.has(g.slug) && (movimentados.get(g.slug) ?? 0) > 0)
    .sort((a, b) => (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? ''))
    .map((g) => item(g.slug, g.name, null));
  return [...itens, ...resto];
}

const DIA_MS = 24 * 60 * 60_000;

export async function caixaDeEntrada(opts: OpcoesCaixa = {}): Promise<CaixaEntrada> {
  const filtro = opts.grupos?.length ? new Set(opts.grupos) : null;
  const [todosGrupos, links, triage] = await Promise.all([listGroups(), readLinks(), readTriage()]);
  // Silenciado some da fila do painel; aqui também, nos dois modos.
  const grupos = todosGrupos.filter((g) => (!filtro || filtro.has(g.slug)) && !triage.muted[g.slug]);
  const inbox = await buildInbox({ grupos, ...(filtro ? { slugs: filtro } : {}) });

  if (!opts.todos) {
    const itens = montarCaixa(inbox, grupos, links, null);
    return { modo: 'pendentes', desde: null, total: itens.length, itens };
  }

  const desde = opts.desde ?? new Date(Date.now() - DIA_MS).toISOString();
  const contacts = await buildContacts();
  const recentes = grupos.filter((g) => (g.lastTimestamp ?? '') >= desde);
  const contagens = await Promise.all(
    recentes.map(async (g) => [g.slug, contarDoCliente(await readGroupRecords(g.slug), desde, contacts)] as const),
  );
  const itens = montarCaixa(inbox, grupos, links, new Map(contagens));
  return { modo: 'todos', desde, total: itens.length, itens };
}
