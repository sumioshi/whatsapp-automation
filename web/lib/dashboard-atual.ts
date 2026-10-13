import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readGroupsConfig } from './config';
import { type Contacts, buildContacts, numberFromJid, roleOf } from './contacts';
import { CONTRATO_PADRAO, type Contrato, readContratos } from './contratos';
import { type Dashboard, montarDashboard } from './dashboard';
import { type MessageRecord, conversationName, readGroupRecords } from './data';
import { listarFeatures } from './features';
import type { EntradaMetrica } from './metricas';
import { DATA_DIR } from './paths';
import { slugify } from './slug';

const CACHE_MS = 60_000;
const CONTRATOS_FILE = () => join(DATA_DIR, '.contratos.json');
const FEATURES_FILE = () => join(DATA_DIR, 'features.jsonl');

let cache: { emMs: number; contratosMtime: number; featuresMtime: number; valor: Dashboard } | null = null;

/** mtime do arquivo em ms; ausente ou ilegível → 0 (o cache trata como "ainda não existe"). */
async function mtime(path: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return 0;
  }
}

/** Mensagens com o papel de quem mandou: a equipe conversando no grupo não é demanda do cliente. */
function comPapel(registros: MessageRecord[], contatos: Contacts): EntradaMetrica['mensagens'] {
  return registros.map((r) => ({
    timestamp: r.timestamp,
    fromMe: Boolean(r.fromMe),
    papel: roleOf(contatos, numberFromJid(r.sender ?? '')),
  }));
}

/** Um chat sem contrato nem entrega não tem nada de negócio pra mostrar no dashboard. */
function temNegocio(contrato: Contrato | undefined, entregas: number): boolean {
  if (entregas > 0) return true;
  if (!contrato) return false;
  return (
    contrato.estado !== CONTRATO_PADRAO.estado ||
    contrato.inicio !== CONTRATO_PADRAO.inicio ||
    contrato.fim !== CONTRATO_PADRAO.fim ||
    contrato.valorMensal !== CONTRATO_PADRAO.valorMensal ||
    contrato.nota !== CONTRATO_PADRAO.nota
  );
}

/**
 * Monta o dashboard a partir dos grupos monitorados; cache de 60 s em memória.
 * Exportado à parte da rota (`web/app/api/dashboard/route.ts`) e da fachada
 * (`dsDashboard` em `data-source.ts`) pra ambas importarem sem uma depender da outra.
 *
 * O TTL existe porque remontar relê as mensagens de todos os chats — caro. Mas o
 * cache é chaveado TAMBÉM pelo mtime dos dois arquivos de negócio (contratos e
 * entregas), então qualquer escrita — painel, MCP ou workflow — aparece na hora;
 * só a contagem de mensagens é que pode ficar até 60 s atrás.
 */
export async function montarDashboardAtual(): Promise<Dashboard> {
  const agora = Date.now();
  const [contratosMtime, featuresMtime] = await Promise.all([mtime(CONTRATOS_FILE()), mtime(FEATURES_FILE())]);
  if (
    cache &&
    agora - cache.emMs < CACHE_MS &&
    cache.contratosMtime === contratosMtime &&
    cache.featuresMtime === featuresMtime
  ) {
    return cache.valor;
  }

  const [config, contatos] = await Promise.all([readGroupsConfig().catch(() => []), buildContacts()]);
  const entradas: EntradaMetrica[] = [];
  const vistos = new Set<string>();
  for (const g of config) {
    if (!g.watch) continue;
    const slug = g.slug ?? slugify(g.name);
    const registros = await readGroupRecords(slug);
    vistos.add(slug);
    entradas.push({ slug, nome: g.name, mensagens: comPapel(registros, contatos) });
  }

  const [contratos, features] = await Promise.all([readContratos(), listarFeatures()]);

  // Cliente atendido por DM não aparece no groups.config (que só lista grupos),
  // mas o contrato e as entregas dele existem — então entra no dashboard assim
  // que houver um dos dois. DM sem nada de negócio continua de fora.
  const entregasPorSlug = new Map<string, number>();
  for (const f of features) entregasPorSlug.set(f.slug, (entregasPorSlug.get(f.slug) ?? 0) + 1);
  const candidatos = new Set<string>([...Object.keys(contratos), ...entregasPorSlug.keys()]);
  for (const slug of candidatos) {
    if (!slug.startsWith('dm-') || vistos.has(slug)) continue;
    if (!temNegocio(contratos[slug], entregasPorSlug.get(slug) ?? 0)) continue;
    // readGroupRecords devolve [] quando o diretório não existe; o catch cobre só
    // um slug malformado que o safeDataPath recuse — a linha ainda vale pelo contrato.
    const registros = await readGroupRecords(slug).catch(() => []);
    entradas.push({
      slug,
      nome: conversationName(slug, slug, registros),
      mensagens: comPapel(registros, contatos),
    });
  }

  const valor = montarDashboard(entradas, contratos, features, agora);
  cache = { emMs: agora, contratosMtime, featuresMtime, valor };
  return valor;
}
