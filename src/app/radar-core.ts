/**
 * Núcleo puro do radar de sem-resposta: decide quem está aguardando e quando
 * vale mandar digest. Sem I/O e sem relógio próprio — o Radar (loop) injeta.
 */

export interface RadarConfig {
  ativo: boolean;
  /** "YYYY-MM-DD" — chat cuja última atividade é ANTERIOR fica de fora (dormente). */
  dataCorte: string | null;
  prazoMinimoMin: number;
  intervaloMin: number;
  digestCooldownMin: number;
}

export const RADAR_DEFAULTS: RadarConfig = {
  ativo: false,
  dataCorte: null,
  prazoMinimoMin: 120,
  intervaloMin: 15,
  digestCooldownMin: 120,
};

export interface EntradaRadar {
  slug: string;
  nome: string;
  ultimaMsg: { fromMe: boolean; timestampMs: number } | null;
  lastActivityMs: number | null;
  muted: boolean;
}

export interface Pendencia {
  slug: string;
  nome: string;
  desdeIso: string;
  horas: number;
}

const H_MS = 60 * 60_000;

/** Pendência = última mensagem é do CLIENTE, espera ≥ prazo, chat vivo e não silenciado. */
export function calcularPendencias(
  entradas: EntradaRadar[],
  agoraMs: number,
  config: RadarConfig,
): Pendencia[] {
  if (!config.ativo) return [];
  const corteMs = config.dataCorte ? Date.parse(config.dataCorte) : null;
  const out: Pendencia[] = [];
  for (const e of entradas) {
    if (e.muted || !e.ultimaMsg || e.ultimaMsg.fromMe) continue;
    const esperaMs = agoraMs - e.ultimaMsg.timestampMs;
    if (esperaMs < config.prazoMinimoMin * 60_000) continue;
    const atividadeMs = Math.max(e.ultimaMsg.timestampMs, e.lastActivityMs ?? 0);
    if (corteMs !== null && !Number.isNaN(corteMs) && atividadeMs < corteMs) continue;
    out.push({
      slug: e.slug,
      nome: e.nome,
      desdeIso: new Date(e.ultimaMsg.timestampMs).toISOString(),
      horas: Math.floor(esperaMs / H_MS),
    });
  }
  return out.sort((a, b) => b.horas - a.horas);
}

/** Identidade do CONJUNTO de pendências (a espera crescer não é novidade). */
export function hashPendencias(pendencias: Pendencia[]): string {
  return pendencias
    .map((p) => p.slug)
    .sort()
    .join('|');
}

/** Digest sai só quando o conjunto muda E o cooldown passou. Vazio nunca dispara. */
export function deveEnviarDigest(
  hashAtual: string,
  ultimoHash: string | null,
  enviadoEmMs: number | null,
  agoraMs: number,
  cooldownMin: number,
): boolean {
  if (hashAtual === '') return false;
  if (hashAtual === ultimoHash) return false;
  if (enviadoEmMs !== null && agoraMs - enviadoEmMs < cooldownMin * 60_000) return false;
  return true;
}

function rotuloEspera(horas: number): string {
  return horas < 24 ? `${horas}h` : `${Math.floor(horas / 24)}d`;
}

export function formatarDigest(pendencias: Pendencia[]): string {
  const itens = pendencias.map((p) => `${p.nome} (${rotuloEspera(p.horas)})`).join(' · ');
  return `⏰ ${pendencias.length} aguardando resposta: ${itens}`;
}
