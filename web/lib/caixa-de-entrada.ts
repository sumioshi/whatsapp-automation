import { basename } from 'node:path';
import { buildContacts, numberFromJid, roleOf, type Contacts } from './contacts';
import { type GroupSummary, listGroups, readGroupRecords } from './data';
import { horaBRT } from './context';
import { buildInbox, type InboxItem } from './inbox';
import { type LinksMap, readLinks } from './links';
import { relativeLabel } from './sla';
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
  /** Início da espera (1ª fala do cliente sem resposta). */
  desde: string;
  desde_brt: string;
  ha: string;
  /** Última fala do cliente, em Brasília, e quanto tempo faz. */
  ultima_brt: string;
  ultima_ha: string;
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

export interface EsperaAntiga {
  grupo: string;
  nome: string;
  projeto: string | null;
  ha: string;
  ultima_brt: string;
}

export interface CaixaEntrada {
  /** Agora em Brasília, pra comparar com os horários dos itens. */
  agora_brt: string;
  modo: 'pendentes' | 'todos';
  desde: string | null;
  total: number;
  itens: ItemCaixaEntrada[];
  /** Cliente fechou a conversa ("ok", "combinado", "valeu"): teve a última palavra, mas não espera nada. */
  encerrados: number;
  /** Esperando, mas a última fala do cliente é mais velha que `dias`: só o essencial, pra não sumir. */
  antigos: EsperaAntiga[];
}

export interface OpcoesCaixa {
  /** false (default) = só quem espera resposta; true = também o que se mexeu desde `desde`. */
  todos?: boolean;
  /** ISO; só vale no modo todos. */
  desde?: string;
  /** Restringe a estes chats. */
  grupos?: string[];
  /** Espera cuja última fala do cliente passou disso vai para `antigos` (default 7). */
  dias?: number;
}

const DIA_MS = 24 * 60 * 60_000;

export function projetoDe(links: LinksMap, slug: string): ProjetoDoChat | null {
  const l = links[slug];
  if (!l) return null;
  return { cliente: l.cliente, repo: basename(l.repoPath), github: l.github || null };
}

function paraEspera(i: InboxItem, agora: number): EsperaDoChat {
  return {
    motivo: i.reason === 'mentioned' ? 'mencao' : 'cliente_esperando',
    de: i.who,
    previa: i.preview,
    desde: i.waitingSince,
    desde_brt: horaBRT(i.waitingSince),
    ha: i.waitingLabel,
    ultima_brt: horaBRT(i.timestamp),
    ultima_ha: relativeLabel(Math.max(0, agora - new Date(i.timestamp).getTime())),
    faixa: i.band,
  };
}

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** Palavras de quem só confirma, agradece ou fecha o assunto. */
const VOCAB_FECHO = new Set(
  (
    'ok okay okey oks blz beleza valeu vlw obrigado obrigada obrigados obg brigado brigada grato grata agradeco ' +
    'agradecida combinado combinados fechado fechou show top perfeito perfeita tranquilo tranquila certo certinho ' +
    'entendi entendido otimo otima maravilha joia massa boa bom legal excelente tmj demais amem de nada pode ser ' +
    'assim mesmo vou vamos testar ver olhar tudo bem e o a muito mt mto sim isso entao aqui ja jaja abraco abracos ' +
    'opa kk kkk kkkk haha ' 
  )
    .trim()
    .split(/\s+/),
);
const AGRADECE = /\b(obrigad|brigad|agradec|valeu|vlw|obg|grat[oa]\b)/;
/** Agradecimento que ainda carrega problema ou pedido não fecha nada. */
const AINDA_PEDE = /\b(mas|porem|ainda|nao|erro|problema|bug|preciso|precisa|urgente|quando|cade|consegue|poderia)\b/;

/**
 * true quando a última fala do cliente só fecha o assunto: confirmação curta,
 * agradecimento sem pedido ou figurinha. Pergunta nunca fecha. Regra simples de
 * propósito: na dúvida, o chat continua na lista.
 */
export function encerramento(previa: string): boolean {
  if (previa === '[figurinha]') return true;
  // Áudio, imagem, documento: não dá pra saber o que diz, então continua esperando.
  if (/^\[[^\]]+\]$/.test(previa)) return false;
  if (previa.includes('?') || previa.length > 80) return false;
  const t = normalizar(previa);
  const palavras = t.match(/[a-z]+/g) ?? [];
  if (palavras.length === 0) return /^[\p{Extended_Pictographic}\s\u200d\ufe0f]+$/u.test(previa);
  const desconhecidas = palavras.filter((p) => !VOCAB_FECHO.has(p));
  // Uma palavra fora do vocabulário em frase curta é quase sempre o nome de quem recebe ("Ok Tadeu").
  if (desconhecidas.length === 0 || (desconhecidas.length === 1 && previa.length <= 25)) return true;
  return AGRADECE.test(t) && !AINDA_PEDE.test(t);
}

/** Separa a fila em recentes, antigos (pela última fala do cliente) e encerrados. */
export function separarEspera(
  inbox: InboxItem[],
  dias: number,
  agora: number,
): { recentes: InboxItem[]; antigos: InboxItem[]; encerrados: number } {
  const limite = agora - dias * DIA_MS;
  const recentes: InboxItem[] = [];
  const antigos: InboxItem[] = [];
  let encerrados = 0;
  for (const i of inbox) {
    if (i.reason === 'client-waiting' && encerramento(i.preview)) encerrados++;
    else if (new Date(i.timestamp).getTime() < limite) antigos.push(i);
    else recentes.push(i);
  }
  return { recentes, antigos, encerrados };
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
  agora: number = Date.now(),
): ItemCaixaEntrada[] {
  const porSlug = new Map(grupos.map((g) => [g.slug, g]));
  const item = (slug: string, nome: string, espera: InboxItem | null): ItemCaixaEntrada => {
    const g = porSlug.get(slug);
    return {
      grupo: slug,
      nome: g?.name ?? nome,
      projeto: projetoDe(links, slug),
      esperando: espera ? paraEspera(espera, agora) : null,
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

export async function caixaDeEntrada(opts: OpcoesCaixa = {}): Promise<CaixaEntrada> {
  const filtro = opts.grupos?.length ? new Set(opts.grupos) : null;
  const [todosGrupos, links, triage] = await Promise.all([listGroups(), readLinks(), readTriage()]);
  // Silenciado some da fila do painel; aqui também, nos dois modos.
  const grupos = todosGrupos.filter((g) => (!filtro || filtro.has(g.slug)) && !triage.muted[g.slug]);
  const fila = await buildInbox({ grupos, ...(filtro ? { slugs: filtro } : {}) });
  const agora = Date.now();
  const { recentes: inbox, antigos, encerrados } = separarEspera(fila, opts.dias ?? 7, agora);
  const extra = {
    agora_brt: horaBRT(new Date(agora).toISOString()),
    encerrados,
    antigos: antigos.map((i) => ({
      grupo: i.slug,
      nome: i.groupName,
      projeto: projetoDe(links, i.slug)?.repo ?? null,
      ha: i.waitingLabel,
      ultima_brt: horaBRT(i.timestamp),
    })),
  };

  if (!opts.todos) {
    const itens = montarCaixa(inbox, grupos, links, null, agora);
    return { modo: 'pendentes', desde: null, total: itens.length, itens, ...extra };
  }

  const desde = opts.desde ?? new Date(Date.now() - DIA_MS).toISOString();
  const contacts = await buildContacts();
  const recentes = grupos.filter((g) => (g.lastTimestamp ?? '') >= desde);
  const contagens = await Promise.all(
    recentes.map(async (g) => [g.slug, contarDoCliente(await readGroupRecords(g.slug), desde, contacts)] as const),
  );
  const itens = montarCaixa(inbox, grupos, links, new Map(contagens), agora);
  return { modo: 'todos', desde, total: itens.length, itens, ...extra };
}
