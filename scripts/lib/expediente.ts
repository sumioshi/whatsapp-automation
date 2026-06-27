export type DiaSemana = 'dom' | 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab';

/** Config do recado automático de expediente. Vive em `<DATA_DIR>/expediente.json`. */
export interface ExpedienteConfig {
  /** Liga/desliga o agendador. */
  ativo: boolean;
  /** Fuso para interpretar os horários (ex.: 'America/Sao_Paulo'). */
  timezone: string;
  /**
   * Faixa [abre, fecha) por dia da semana, no formato 'HH:MM'. Dia ausente ou
   * faixa undefined = fora o dia todo (ex.: sáb/dom sem entrada = sempre fora).
   */
  dias: Partial<Record<DiaSemana, [string, string]>>;
  /** Recado aplicado quando DENTRO do expediente. */
  recado_dentro: string;
  /** Recado aplicado quando FORA do expediente. */
  recado_fora: string;
}

const ORDEM_DIAS: DiaSemana[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

/** Extrai {dia, minutos-desde-meia-noite} de um instante NO fuso pedido. */
function noFuso(agora: Date, timezone: string): { dia: DiaSemana; minutos: number } {
  // 'en-US' com weekday short dá 'Mon'/'Tue'/...; mapeamos via getUTCDay sobre um
  // instante reconstruído? Mais robusto: usar Intl com as partes e o weekday.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(agora);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  let hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  // Intl pode devolver '24' à meia-noite em alguns ambientes; normaliza.
  if (hh === 24) hh = 0;
  const mapa: Record<string, DiaSemana> = {
    Sun: 'dom',
    Mon: 'seg',
    Tue: 'ter',
    Wed: 'qua',
    Thu: 'qui',
    Fri: 'sex',
    Sat: 'sab',
  };
  return { dia: mapa[wd] ?? 'dom', minutos: hh * 60 + mm };
}

/** Converte 'HH:MM' em minutos desde a meia-noite. */
function hhmmEmMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * 'dentro' se `agora` (no fuso do config) cai na faixa [abre, fecha) do dia
 * correspondente; senão 'fora'. Dia ausente ou faixa indefinida = 'fora'.
 */
export function estadoExpediente(agora: Date, cfg: ExpedienteConfig): 'dentro' | 'fora' {
  const { dia, minutos } = noFuso(agora, cfg.timezone);
  const faixa = cfg.dias[dia];
  if (!faixa || faixa.length !== 2) return 'fora';
  const abre = hhmmEmMin(faixa[0]);
  const fecha = hhmmEmMin(faixa[1]);
  return minutos >= abre && minutos < fecha ? 'dentro' : 'fora';
}

/** O recado correspondente ao estado. */
export function recadoPara(estado: 'dentro' | 'fora', cfg: ExpedienteConfig): string {
  return estado === 'dentro' ? cfg.recado_dentro : cfg.recado_fora;
}

/** Exportado só para manter `ORDEM_DIAS` referenciada (ordem canônica dos dias). */
export const DIAS_SEMANA = ORDEM_DIAS;

export interface AcaoExpediente {
  /** Se deve chamar o control server para trocar o recado agora. */
  aplicar: boolean;
  /** Estado calculado para `agora`. */
  estado: 'dentro' | 'fora';
  /** Recado a aplicar (só quando `aplicar` é true), senão null. */
  recado: string | null;
}

/**
 * Regra do agendador: troca o recado SÓ na transição. Não aplica se o expediente
 * está desligado (`ativo:false`) ou se o estado novo é igual ao último aplicado
 * (antispam). No primeiro boot (`ultimoAplicado === null`) aplica o estado atual.
 */
export function decidirAcao(
  agora: Date,
  cfg: ExpedienteConfig,
  ultimoAplicado: 'dentro' | 'fora' | null,
): AcaoExpediente {
  const estado = estadoExpediente(agora, cfg);
  if (!cfg.ativo || estado === ultimoAplicado) {
    return { aplicar: false, estado, recado: null };
  }
  return { aplicar: true, estado, recado: recadoPara(estado, cfg) };
}
