import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { DATA_DIR } from './paths';

/**
 * Fila de decisões do operador ("despacho"): um arquivo por passada da triagem,
 * itens numerados globalmente pra ele responder `ok N` no WhatsApp. O painel
 * grava; o coletor envia e executa. Contrato compartilhado com `src/app/despacho-core.ts`.
 */
export type TipoItem = 'issue' | 'pergunta' | 'bug' | 'info';
export type AcaoItem = 'nenhuma' | 'label' | 'enviar';

export interface ItemDespachoEntrada {
  slug: string;
  cliente: string;
  tipo: TipoItem;
  titulo: string;
  url?: string | null;
  texto?: string | null;
  issue?: { repo: string; numero: number } | null;
  acao?: AcaoItem;
  label?: string | null;
}

export interface ItemDespacho {
  n: number;
  id: string;
  slug: string;
  cliente: string;
  tipo: TipoItem;
  titulo: string;
  url: string | null;
  texto: string | null;
  issue: { repo: string; numero: number } | null;
  acao: AcaoItem;
  label: string | null;
  executadoEm: string | null;
  resultado: string | null;
}

export interface ArquivoDespacho {
  passada: string;
  criadoEm: string;
  enviadoEm: string | null;
  itens: ItemDespacho[];
  /** true quando gravarDespacho devolveu o arquivo já existente em vez de gravar. */
  jaExistia?: boolean;
}

const DIR = () => join(DATA_DIR, 'despacho');
const PASSADA_RE = /^\d{4}-\d{2}-\d{2}T\d{4}$/;
const TIPOS: TipoItem[] = ['issue', 'pergunta', 'bug', 'info'];
const ACOES: AcaoItem[] = ['nenhuma', 'label', 'enviar'];

export function passadaValida(p: string): boolean {
  return PASSADA_RE.test(p);
}

function acaoPadrao(tipo: TipoItem): AcaoItem {
  if (tipo === 'pergunta') return 'enviar';
  if (tipo === 'info') return 'nenhuma';
  return 'label';
}

/** Valida um item vindo do worker. Lança com mensagem legível pro operador. */
export function validarItem(raw: unknown): Required<ItemDespachoEntrada> {
  if (!raw || typeof raw !== 'object') throw new Error('item deve ser objeto');
  const r = raw as Record<string, unknown>;
  const str = (k: string): string => {
    const v = r[k];
    if (typeof v !== 'string' || !v.trim()) throw new Error(`item sem ${k}`);
    return v.trim();
  };
  const tipo = str('tipo') as TipoItem;
  if (!TIPOS.includes(tipo)) throw new Error(`tipo inválido: ${tipo}`);
  const acao = (r.acao ?? acaoPadrao(tipo)) as AcaoItem;
  if (!ACOES.includes(acao)) throw new Error(`acao inválida: ${String(r.acao)}`);
  let issue: { repo: string; numero: number } | null = null;
  if (r.issue && typeof r.issue === 'object') {
    const i = r.issue as Record<string, unknown>;
    if (typeof i.repo === 'string' && typeof i.numero === 'number') issue = { repo: i.repo, numero: i.numero };
  }
  return {
    slug: str('slug'),
    cliente: str('cliente'),
    tipo,
    titulo: str('titulo'),
    url: typeof r.url === 'string' ? r.url : null,
    texto: typeof r.texto === 'string' ? r.texto : null,
    issue,
    acao,
    label: typeof r.label === 'string' ? r.label : null,
  };
}

function parseArquivo(raw: string): ArquivoDespacho | null {
  try {
    const d = JSON.parse(raw) as ArquivoDespacho;
    return typeof d.passada === 'string' && Array.isArray(d.itens) ? d : null;
  } catch {
    return null;
  }
}

/**
 * Despachos gravados, do mais antigo pro mais novo. Com `desde` (no formato da
 * passada), lê só os arquivos a partir dela: o nome do arquivo é a passada, então
 * a ordem do nome é a do tempo e os antigos nem são abertos.
 */
export async function listarDespachos(opts: { desde?: string } = {}): Promise<ArquivoDespacho[]> {
  let nomes: string[];
  try {
    nomes = (await readdir(DIR())).filter((n) => n.endsWith('.json') && (!opts.desde || n >= opts.desde)).sort();
  } catch {
    return [];
  }
  const out: ArquivoDespacho[] = [];
  for (const nome of nomes) {
    const d = parseArquivo(await readFile(join(DIR(), nome), 'utf8'));
    if (d) out.push(d);
  }
  return out;
}

/**
 * Grava a passada com numeração global (continua do maior `n` já existente).
 * Idempotente por `passada`: se `despacho/<passada>.json` já existe e é
 * válido, devolve ele sem tocar no disco — um workflow que re-roda (retry,
 * painel reiniciado no meio) manda a mesma passada de novo, e sobrescrever
 * resetaria `enviadoEm`/`executadoEm`, reabrindo pro operador decisão que
 * ele já tomou e podendo reenviar uma pergunta pro cliente duas vezes.
 */
export async function gravarDespacho(
  passada: string,
  itens: ItemDespachoEntrada[],
  agora: Date = new Date(),
): Promise<ArquivoDespacho> {
  if (!passadaValida(passada)) throw new Error('passada deve ter o formato YYYY-MM-DDTHHmm');
  const arquivoPath = join(DIR(), `${passada}.json`);
  const existente = parseArquivo(await readFile(arquivoPath, 'utf8').catch(() => ''));
  if (existente) return { ...existente, jaExistia: true };

  const existentes = await listarDespachos();
  let n = existentes.reduce((max, d) => Math.max(max, ...d.itens.map((i) => i.n)), 0);
  const arquivo: ArquivoDespacho = {
    passada,
    criadoEm: agora.toISOString(),
    enviadoEm: null,
    itens: itens.map((entrada, idx) => {
      const v = validarItem(entrada);
      n += 1;
      return { n, id: `${passada}-${idx + 1}`, ...v, executadoEm: null, resultado: null };
    }),
  };
  await mkdir(DIR(), { recursive: true });
  await writeJsonAtomic(arquivoPath, arquivo);
  return arquivo;
}
