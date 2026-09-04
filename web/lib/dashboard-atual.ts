import { readGroupsConfig } from './config';
import { readContratos } from './contratos';
import { type Dashboard, montarDashboard } from './dashboard';
import { readGroupRecords } from './data';
import { listarFeatures } from './features';
import type { EntradaMetrica } from './metricas';
import { slugify } from './slug';

const CACHE_MS = 60_000;
let cache: { emMs: number; valor: Dashboard } | null = null;

/**
 * Monta o dashboard a partir dos grupos monitorados; cache de 60 s em memória.
 * Exportado à parte da rota (`web/app/api/dashboard/route.ts`) e da fachada
 * (`dsDashboard` em `data-source.ts`) pra ambas importarem sem uma depender da outra.
 */
export async function montarDashboardAtual(): Promise<Dashboard> {
  const agora = Date.now();
  if (cache && agora - cache.emMs < CACHE_MS) return cache.valor;
  const config = await readGroupsConfig().catch(() => []);
  const entradas: EntradaMetrica[] = [];
  for (const g of config) {
    if (!g.watch) continue;
    const slug = g.slug ?? slugify(g.name);
    const registros = await readGroupRecords(slug);
    entradas.push({ slug, nome: g.name, mensagens: registros.map((r) => ({ timestamp: r.timestamp, fromMe: Boolean(r.fromMe) })) });
  }
  const [contratos, features] = await Promise.all([readContratos(), listarFeatures()]);
  const valor = montarDashboard(entradas, contratos, features, agora);
  cache = { emMs: agora, valor };
  return valor;
}
