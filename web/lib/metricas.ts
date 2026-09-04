/**
 * Métricas de atividade dos chats pra tela inicial: quem mais manda mensagem,
 * quem está mais e menos ativo, quem adormeceu. Puro — recebe registros e relógio.
 */
export type Janela = '24h' | '7d' | '30d';

const H_MS = 60 * 60_000;
const D_MS = 24 * H_MS;
export const JANELAS_MS: Record<Janela, number> = { '24h': D_MS, '7d': 7 * D_MS, '30d': 30 * D_MS };
/** Chat "vivo" pra disputa de menos ativo: alguma mensagem nos últimos 90 dias. */
const VIVO_MS = 90 * D_MS;
/** Adormecido: nada há mais de 14 dias (mas já teve mensagem alguma vez). */
const ADORMECIDO_MS = 14 * D_MS;

export interface EntradaMetrica {
  slug: string;
  nome: string;
  mensagens: Array<{ timestamp: string; fromMe: boolean }>;
}

export interface MetricaGrupo {
  slug: string;
  nome: string;
  total: number;
  cliente: number;
  operador: number;
  ultimaMs: number | null;
}

export interface Metricas {
  janela: Janela;
  totalMensagens: number;
  ranking: MetricaGrupo[];
  maisAtivo: MetricaGrupo | null;
  menosAtivo: MetricaGrupo | null;
  adormecidos: Array<{ slug: string; nome: string; dias: number }>;
}

export function calcularMetricas(entradas: EntradaMetrica[], agoraMs: number, janela: Janela): Metricas {
  const inicio = agoraMs - JANELAS_MS[janela];
  const grupos: MetricaGrupo[] = entradas.map((e) => {
    let total = 0;
    let cliente = 0;
    let ultimaMs: number | null = null;
    for (const m of e.mensagens) {
      const ts = Date.parse(m.timestamp);
      if (Number.isNaN(ts)) continue;
      if (ultimaMs === null || ts > ultimaMs) ultimaMs = ts;
      if (ts < inicio || ts > agoraMs) continue;
      total++;
      if (!m.fromMe) cliente++;
    }
    return { slug: e.slug, nome: e.nome, total, cliente, operador: total - cliente, ultimaMs };
  });

  // ranking: quem tem mensagem na janela OU esteve vivo nos últimos 90 dias
  const ranking = grupos
    .filter((g) => g.ultimaMs !== null && agoraMs - g.ultimaMs <= VIVO_MS)
    .sort((a, b) => b.total - a.total || (b.ultimaMs ?? 0) - (a.ultimaMs ?? 0) || a.slug.localeCompare(b.slug));

  const comMsg = ranking.filter((g) => g.total > 0);
  const maisAtivo = comMsg[0] ?? null;
  const menosAtivo =
    ranking.length > 0
      ? [...ranking].sort((a, b) => a.total - b.total || (a.ultimaMs ?? 0) - (b.ultimaMs ?? 0))[0] ?? null
      : null;

  const adormecidos = grupos
    .filter((g) => g.ultimaMs !== null && agoraMs - g.ultimaMs > ADORMECIDO_MS)
    .sort((a, b) => (a.ultimaMs ?? 0) - (b.ultimaMs ?? 0))
    .map((g) => ({ slug: g.slug, nome: g.nome, dias: Math.round((agoraMs - (g.ultimaMs ?? agoraMs)) / D_MS) }));

  return {
    janela,
    totalMensagens: grupos.reduce((s, g) => s + g.total, 0),
    ranking,
    maisAtivo,
    menosAtivo,
    adormecidos,
  };
}
