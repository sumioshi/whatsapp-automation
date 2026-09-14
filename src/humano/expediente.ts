/**
 * Versão mínima (e independente) da lógica de expediente do
 * `scripts/lib/expediente.ts` — reimplementada aqui porque `scripts/` fica
 * fora do `rootDir`/`include` do tsconfig (src) e importar de lá quebraria o
 * `tsc`. Só o suficiente pra decidir dentro/fora; NUNCA lança (falha vira
 * "dentro do expediente", ou seja, sem duplicar o multiplicador de leitura).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type DiaSemana = 'dom' | 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab';

export interface ExpedienteConfig {
  ativo: boolean;
  timezone: string;
  dias: Partial<Record<DiaSemana, [string, string]>>;
  recado_dentro: string;
  recado_fora: string;
  /** Represa entregas até a próxima abertura (default false = só atrasa). */
  segurarEnvios?: boolean;
  /** available/unavailable em volta da entrega (default true). */
  presencaCoerente?: boolean;
}

const DIAS_ORDEM: DiaSemana[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

const DIA_POR_WEEKDAY: Record<string, DiaSemana> = {
  Sun: 'dom',
  Mon: 'seg',
  Tue: 'ter',
  Wed: 'qua',
  Thu: 'qui',
  Fri: 'sex',
  Sat: 'sab',
};

function hhmmEmMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** True se `agora` (no fuso de `cfg`) cai FORA da faixa configurada pro dia. */
export function foraDaFaixa(agora: Date, cfg: ExpedienteConfig): boolean {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: cfg.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(agora);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  let hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  if (hh === 24) hh = 0; // Intl pode devolver '24' à meia-noite em alguns ambientes
  const dia = DIA_POR_WEEKDAY[wd] ?? 'dom';
  const minutos = hh * 60 + mm;

  const faixa = cfg.dias[dia];
  if (!faixa || faixa.length !== 2) return true;
  const abre = hhmmEmMin(faixa[0]);
  const fecha = hhmmEmMin(faixa[1]);
  return !(minutos >= abre && minutos < fecha);
}

function isExpedienteConfig(v: unknown): v is ExpedienteConfig {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.ativo === 'boolean' &&
    typeof c.timezone === 'string' &&
    typeof c.dias === 'object' &&
    c.dias !== null
  );
}

/** Hora (0–23) e dia da semana (0 = domingo) de `agora` no fuso. Fuso inválido → UTC. */
export function horaLocal(agora: Date, timezone: string): { hora: number; diaSemana: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(agora);
    let hora = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    if (hora === 24) hora = 0;
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
    return { hora, diaSemana: DIAS_ORDEM.indexOf(DIA_POR_WEEKDAY[wd] ?? 'dom') };
  } catch {
    return { hora: agora.getUTCHours(), diaSemana: agora.getUTCDay() };
  }
}

/** Offset (ms) do fuso em `instante`: local − UTC. */
function offsetMs(instante: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instante);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const h = g('hour') === 24 ? 0 : g('hour');
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), h, g('minute'), g('second'));
  return asUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/**
 * Próximo instante em que o expediente abre, ou null se `agora` já está dentro
 * (ou nenhum dia configurado nos próximos 7). Caminha dia a dia no fuso.
 */
export function proximaAbertura(agora: Date, cfg: ExpedienteConfig): Date | null {
  if (!foraDaFaixa(agora, cfg)) return null;
  for (let d = 0; d < 8; d++) {
    const ref = new Date(agora.getTime() + d * 86_400_000);
    const off = offsetMs(ref, cfg.timezone);
    const local = new Date(ref.getTime() + off);
    const dia = DIAS_ORDEM[local.getUTCDay()] ?? 'dom';
    const faixa = cfg.dias[dia];
    if (!faixa) continue;
    const [hh, mm] = faixa[0].split(':').map(Number);
    const abertura = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh ?? 0, mm ?? 0) -
        off,
    );
    if (abertura.getTime() > agora.getTime()) return abertura;
  }
  return null;
}

/** Config crua (validada) ou null: arquivo ausente/inválido. Nunca lança. */
export async function lerExpediente(dataDir: string): Promise<ExpedienteConfig | null> {
  try {
    const cfg: unknown = JSON.parse(await readFile(join(dataDir, 'expediente.json'), 'utf8'));
    return isExpedienteConfig(cfg) ? cfg : null;
  } catch {
    return null;
  }
}

/**
 * True se, agora, o chat está fora do expediente configurado em
 * `<dataDir>/expediente.json`. Arquivo ausente, JSON inválido ou
 * `ativo !== true` → false (nunca lança).
 */
export async function foraDoExpediente(
  dataDir: string,
  agora: Date = new Date(),
): Promise<boolean> {
  const cfg = await lerExpediente(dataDir);
  if (!cfg || cfg.ativo !== true) return false;
  return foraDaFaixa(agora, cfg);
}
