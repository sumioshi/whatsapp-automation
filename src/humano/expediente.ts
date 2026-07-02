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

interface ExpedienteConfig {
  ativo: boolean;
  timezone: string;
  dias: Partial<Record<DiaSemana, [string, string]>>;
  recado_dentro: string;
  recado_fora: string;
}

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
function foraDaFaixa(agora: Date, cfg: ExpedienteConfig): boolean {
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
  return typeof c.ativo === 'boolean' && typeof c.timezone === 'string' && typeof c.dias === 'object' && c.dias !== null;
}

/**
 * True se, agora, o chat está fora do expediente configurado em
 * `<dataDir>/expediente.json`. Arquivo ausente, JSON inválido ou
 * `ativo !== true` → false (nunca lança).
 */
export async function foraDoExpediente(dataDir: string, agora: Date = new Date()): Promise<boolean> {
  try {
    const raw = await readFile(join(dataDir, 'expediente.json'), 'utf8');
    const cfg: unknown = JSON.parse(raw);
    if (!isExpedienteConfig(cfg) || cfg.ativo !== true) return false;
    return foraDaFaixa(agora, cfg);
  } catch {
    return false;
  }
}
