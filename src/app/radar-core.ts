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

/** Nome legível = tem pelo menos uma letra (número cru e LID não contam). */
export function ehNomeLegivel(s: string | null | undefined): boolean {
  return Boolean(s && /\p{L}/u.test(s));
}

/** Formata dígitos como telefone: BR (55…) vira +55 DD XXXXX-XXXX; resto, +digitos. */
export function formatarFone(digits: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  if (m) return `+55 ${m[1]} ${m[2]}-${m[3]}`;
  return `+${digits}`;
}

/** Teto de nomes no digest — o resto vira "… e mais N" (detalhe fica no painel). */
const DIGEST_MAX_NOMES = 8;

export function formatarDigest(pendencias: Pendencia[]): string {
  const mostradas = pendencias.slice(0, DIGEST_MAX_NOMES);
  const resto = pendencias.length - mostradas.length;
  const itens = mostradas.map((p) => `${p.nome} (${rotuloEspera(p.horas)})`).join(' · ');
  const sufixo = resto > 0 ? ` … e mais ${resto}` : '';
  return `⏰ ${pendencias.length} aguardando resposta: ${itens}${sufixo}`;
}
