/**
 * Utilitários de SLA / urgência para a caixa de entrada.
 *
 * Faixas de tempo de espera (crescentes em urgência):
 *   fresh   — < 1 h   → fg-faint (zero pressão)
 *   mild    — 1–4 h   → fg-dim   (atenção leve)
 *   warm    — 4–24 h  → accent-2 (urgência média — amber)
 *   hot     — > 24 h  → danger   (urgência alta — vermelho)
 *
 * Design: ember raro, mono, hairline — sem semáforo gritante.
 * Menções têm prioridade de exibição mas urgência baseada no mesmo waitingMs.
 */

export type SlaBand = "fresh" | "mild" | "warm" | "hot";

export interface SlaInfo {
  /** Timestamp ISO da 1ª mensagem do cliente ainda não respondida. */
  waitingSince: string;
  /** Milissegundos de espera (agora − waitingSince). */
  waitingMs: number;
  /** Faixa de urgência. */
  band: SlaBand;
  /** Rótulo legível em pt-BR: "há 3h", "há 2 dias". */
  label: string;
}

const MS_1H = 60 * 60 * 1000;
const MS_4H = 4 * MS_1H;
const MS_24H = 24 * MS_1H;

export function getBand(waitingMs: number): SlaBand {
  if (waitingMs < MS_1H) return "fresh";
  if (waitingMs < MS_4H) return "mild";
  if (waitingMs < MS_24H) return "warm";
  return "hot";
}

/**
 * Rótulo relativo em pt-BR para o tempo de espera.
 * Calculado server-side a partir de `now` passado como parâmetro para
 * evitar hydration mismatch (não usa Date.now() no render client).
 */
export function relativeLabel(waitingMs: number): string {
  const mins = Math.floor(waitingMs / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(waitingMs / MS_1H);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(waitingMs / MS_24H);
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
}

/** Cor Tailwind do rótulo de urgência por faixa. */
export const BAND_LABEL_CLASS: Record<SlaBand, string> = {
  fresh: "text-fg-faint",
  mild:  "text-fg-dim",
  warm:  "text-[--color-accent-2]",
  hot:   "text-danger",
};

/** Cor da borda esquerda de urgência (fio hairline). */
export const BAND_BORDER_CLASS: Record<SlaBand, string> = {
  fresh: "border-l-line",
  mild:  "border-l-line-2",
  warm:  "border-l-[color:color-mix(in_oklab,var(--color-accent-2)_45%,transparent)]",
  hot:   "border-l-[color:color-mix(in_oklab,var(--color-danger)_55%,transparent)]",
};

/**
 * Constrói SlaInfo a partir de um timestamp ISO (waitingSince já calculado)
 * e do `now` atual (passado como parâmetro para consistência server-side).
 */
export function buildSlaInfo(waitingSince: string, now: number): SlaInfo {
  const waitingMs = Math.max(0, now - new Date(waitingSince).getTime());
  const band = getBand(waitingMs);
  const label = relativeLabel(waitingMs);
  return { waitingSince, waitingMs, band, label };
}

/**
 * Contagem de itens por faixa.
 */
export function countByBand(items: Array<{ band: SlaBand }>): Record<SlaBand, number> {
  const counts: Record<SlaBand, number> = { fresh: 0, mild: 0, warm: 0, hot: 0 };
  for (const item of items) {
    counts[item.band]++;
  }
  return counts;
}
