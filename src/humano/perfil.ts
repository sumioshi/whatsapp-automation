/**
 * Perfil de cadência por chat, aprendido do jeito que o OPERADOR escreve ali —
 * só de mensagens que ele mesmo digitou (celular/web, ou anteriores à
 * automação), nunca do que o coletor mandou. Cache em
 * data/<slug>/.perfil-envio.json (versão 2, TTL 24 h). Falha → PERFIL_DEFAULT.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PerfilEnvio } from './baloes.js';
import { PERFIL_DEFAULT } from './baloes.js';

export interface MsgHistorico {
  id?: string;
  fromMe: boolean;
  type?: string;
  text?: string;
  timestamp: string;
  origem?: string;
  sender?: string;
  groupJid?: string;
}

const MIN_MSGS = 30;
const MIN_PARES = 5;
const TTL_MS = 24 * 60 * 60 * 1000;
const VERSAO = 2;
const GAP_BALAO_MAX_S = 90;
const GAP_BALAO_MIN_S = 1;
const LATENCIA_MAX_S = 4 * 3600;
const ULTIMOS_PARES = 50;
/** Antes disto, toda msg fromMe era digitada à mão (sem `origem`). */
export const PRE_AUTOMACAO = '2026-06-01';

export function elegivelParaPerfil(m: MsgHistorico): boolean {
  if (!m.fromMe || (m.type && m.type !== 'text') || !m.text?.trim()) return false;
  if (m.origem === 'celular' || m.origem === 'web') return true;
  if (m.origem) return false;
  return m.timestamp < PRE_AUTOMACAO;
}

const mediana = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const ts = (m: MsgHistorico) => Date.parse(m.timestamp);

export function calcularPerfil(msgs: MsgHistorico[]): PerfilEnvio | null {
  const ordenadas = [...msgs].filter((m) => Number.isFinite(ts(m))).sort((a, b) => ts(a) - ts(b));
  const minhas = ordenadas.filter(elegivelParaPerfil);
  if (minhas.length < MIN_MSGS) return null;

  const tamanhos = minhas.map((m) => (m.text as string).trim().length);
  const media = tamanhos.reduce((a, b) => a + b, 0) / tamanhos.length;

  // Pares de balões consecutivos do operador (gap 1–90 s): velocidade e pausa.
  const cps: number[] = [];
  const pausas: number[] = [];
  for (let i = 1; i < ordenadas.length; i++) {
    const a = ordenadas[i - 1] as MsgHistorico;
    const b = ordenadas[i] as MsgHistorico;
    if (!elegivelParaPerfil(a) || !elegivelParaPerfil(b)) continue;
    const gap = (ts(b) - ts(a)) / 1000;
    if (gap < GAP_BALAO_MIN_S || gap > GAP_BALAO_MAX_S) continue;
    cps.push((b.text as string).trim().length / gap);
    pausas.push(gap);
  }

  // Latências: cliente → 1ª resposta do operador; operador → próxima do cliente.
  const latOp: number[] = [];
  const latCli: number[] = [];
  let ultimaDele: MsgHistorico | null = null;
  let ultimaMinha: MsgHistorico | null = null;
  for (const m of ordenadas) {
    if (m.fromMe) {
      if (elegivelParaPerfil(m) && ultimaDele) {
        const g = (ts(m) - ts(ultimaDele)) / 1000;
        if (g <= LATENCIA_MAX_S) latOp.push(g);
        ultimaDele = null;
      }
      ultimaMinha = m;
    } else {
      if (ultimaMinha) {
        const g = (ts(m) - ts(ultimaMinha)) / 1000;
        if (g <= LATENCIA_MAX_S) latCli.push(g);
        ultimaMinha = null;
      }
      ultimaDele = ultimaDele ?? m;
    }
  }

  const medCps = cps.length >= MIN_PARES ? mediana(cps) : null;
  const medPausa = pausas.length >= MIN_PARES ? mediana(pausas) : null;
  const medOp = latOp.length >= MIN_PARES ? mediana(latOp.slice(-ULTIMOS_PARES)) : null;
  const medCli = latCli.length >= MIN_PARES ? mediana(latCli.slice(-ULTIMOS_PARES)) : null;
  return {
    tamanhoMedioBalao: Math.max(40, Math.min(300, Math.round(media))),
    charsPorSegundo: medCps === null ? null : Number(clamp(medCps, 1.8, 5.5).toFixed(2)),
    pausaEntreBaloes_s: medPausa === null ? null : Number(clamp(medPausa, 1, 15).toFixed(1)),
    latenciaMediana_s: medOp === null ? null : Math.round(medOp),
    latenciaClienteMediana_s: medCli === null ? null : Math.round(medCli),
  };
}

/** Última mensagem recebida (não fromMe) de quem não é da equipe. */
export function ultimaDoCliente(
  msgs: MsgHistorico[],
  equipe: Set<string> = new Set(),
): { ts: number; chars: number; id?: string } | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i] as MsgHistorico;
    if (m.fromMe) continue;
    const user = (m.sender ?? '').split('@')[0]?.split(':')[0] ?? '';
    if (equipe.has(user)) continue;
    const t = ts(m);
    if (!Number.isFinite(t)) continue;
    return { ts: t, chars: (m.text ?? '').length, ...(m.id ? { id: m.id } : {}) };
  }
  return null;
}

export async function lerHistorico(dataDir: string, slug: string): Promise<MsgHistorico[]> {
  try {
    const raw = await readFile(join(dataDir, slug, 'messages.jsonl'), 'utf8');
    const out: MsgHistorico[] = [];
    for (const l of raw.split('\n')) {
      if (!l) continue;
      try {
        const m = JSON.parse(l) as MsgHistorico;
        // Recebida em DM pode vir com `sender` vazio: quem escreveu é o outro lado.
        if (!m.fromMe && !m.sender && /@(s\.whatsapp\.net|lid)$/.test(m.groupJid ?? '')) {
          m.sender = m.groupJid;
        }
        if (typeof m.timestamp === 'string') out.push(m);
      } catch {
        /* linha quebrada */
      }
    }
    return out;
  } catch {
    return [];
  }
}

interface CachePerfil {
  versao: number;
  calculadoEm: number;
  perfil: PerfilEnvio;
}

export async function loadPerfilEnvio(
  slug: string | undefined,
  dataDir: string,
): Promise<PerfilEnvio> {
  if (!slug) return PERFIL_DEFAULT;
  const cachePath = join(dataDir, slug, '.perfil-envio.json');
  try {
    const cache = JSON.parse(await readFile(cachePath, 'utf8')) as Partial<CachePerfil>;
    if (cache.versao === VERSAO && cache.perfil && Date.now() - (cache.calculadoEm ?? 0) < TTL_MS) {
      return cache.perfil;
    }
  } catch {
    /* sem cache — calcula */
  }
  try {
    const perfil = calcularPerfil(await lerHistorico(dataDir, slug));
    // Só grava cache com msgs suficientes: gravar o default prenderia um chat novo 24 h nele.
    if (perfil) {
      await writeFile(
        cachePath,
        JSON.stringify({ versao: VERSAO, calculadoEm: Date.now(), perfil } satisfies CachePerfil),
      ).catch(() => {});
    }
    return perfil ?? PERFIL_DEFAULT;
  } catch {
    return PERFIL_DEFAULT;
  }
}
