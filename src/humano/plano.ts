/**
 * Partitura da entrega: dado os balões, a sequência de pausas, digitação e
 * envios que o gateway toca. Sem "visto" (o worker lê antes, na hora certa) e
 * sem teto curto: quem limita o tempo é a latência humana. Puro, rng injetável;
 * o realismo vem da irregularidade (jitter, log-normal, pausas de pensar).
 */
import type { PerfilEnvio } from './baloes.js';
import { PERFIL_DEFAULT } from './baloes.js';

export type Passo =
  | { tipo: 'pausa'; ms: number }
  | { tipo: 'digitando'; ms: number }
  | { tipo: 'enviar'; texto: string; citar?: string };

export interface CtxEntrega {
  typos?: boolean;
  msgRecebidaChars?: number;
  /** id da mensagem recebida a citar (só o 1º balão). */
  citar?: string;
  rng?: () => number;
}

export const CPS_PADRAO = 3.0;
const CPS_MIN = 1.8;
const CPS_MAX = 5.5;
/** Só protege contra bug (balão gigante × perfil lento); não é ritmo. */
export const TETO_SEGURANCA_MS = 6 * 60_000;
const TYPO_CHANCE = 0.03;
const TYPO_MIN_PALAVRAS = 4;
const PISO_DIGITANDO_MS = 300;
const PENSAR_JANELA_CHARS = 40;
const PENSAR_CHANCE = 0.3;
const LEITURA_MS_POR_CHAR = 30;
const LEITURA_TETO_MS = 6000;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** N(0,1) por Box-Muller (com seno: rng constante 0,5 dá 0). */
function normal(rng: () => number): number {
  const u1 = clamp(rng(), 1e-12, 1 - 1e-12);
  return Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * rng());
}

export function planoDeEntrega(
  baloes: string[],
  perfil: PerfilEnvio = PERFIL_DEFAULT,
  ctx: CtxEntrega = {},
): Passo[] {
  const rng = ctx.rng ?? Math.random;
  const passos: Passo[] = [];

  // Leitura: 0,5–1,5 s + 30 ms/char da msg recebida (teto 6 s).
  const leitura =
    500 +
    rng() * 1000 +
    Math.min((ctx.msgRecebidaChars ?? 0) * LEITURA_MS_POR_CHAR, LEITURA_TETO_MS);
  passos.push({ tipo: 'pausa', ms: Math.round(leitura) });

  const cpsBase = clamp(perfil.charsPorSegundo ?? CPS_PADRAO, CPS_MIN, CPS_MAX);
  const validos = baloes.map((b) => b.trim()).filter(Boolean);
  validos.forEach((texto, i) => {
    if (i > 0) passos.push({ tipo: 'pausa', ms: pausaEntreBaloes(perfil, rng) });

    const typo =
      ctx.typos && texto.split(/\s+/).length >= TYPO_MIN_PALAVRAS && rng() < TYPO_CHANCE
        ? injetarTypo(texto, rng)
        : null;
    const digitado = typo?.texto ?? texto;

    const cps = cpsBase * clamp(1 + 0.25 * normal(rng), 0.5, 1.5);
    passos.push(...digitar(digitado, cps, rng));
    passos.push({
      tipo: 'enviar',
      texto: digitado,
      ...(i === 0 && ctx.citar ? { citar: ctx.citar } : {}),
    });

    if (typo) {
      // Erro visivelmente corrigido: balão "*palavra" um pouco depois, nunca edição.
      passos.push({ tipo: 'pausa', ms: Math.round(2000 + rng() * 3000) });
      passos.push({
        tipo: 'digitando',
        ms: Math.max(PISO_DIGITANDO_MS, Math.round(((typo.correta.length + 1) / cps) * 1000)),
      });
      passos.push({ tipo: 'enviar', texto: `*${typo.correta}` });
    }
  });

  return capar(passos, TETO_SEGURANCA_MS);
}

/** Digitação em janelas de 40 chars; entre janelas, com p = 0,3, uma pausa de pensar (0,8–3,5 s). */
function digitar(texto: string, cps: number, rng: () => number): Passo[] {
  const janelas = Math.max(1, Math.ceil(texto.length / PENSAR_JANELA_CHARS));
  const out: Passo[] = [];
  let acumulado = 0;
  for (let j = 0; j < janelas; j++) {
    const chars = Math.min(PENSAR_JANELA_CHARS, texto.length - j * PENSAR_JANELA_CHARS);
    acumulado += (chars / cps) * 1000;
    const pensa = j < janelas - 1 && rng() < PENSAR_CHANCE;
    if (pensa) {
      out.push({ tipo: 'digitando', ms: Math.round(acumulado) });
      out.push({ tipo: 'pausa', ms: Math.round(800 + rng() * 2700) });
      acumulado = 0;
    }
  }
  out.push({ tipo: 'digitando', ms: Math.max(PISO_DIGITANDO_MS, Math.round(acumulado)) });
  return out;
}

function pausaEntreBaloes(perfil: PerfilEnvio, rng: () => number): number {
  if (perfil.pausaEntreBaloes_s) {
    return Math.round(clamp(perfil.pausaEntreBaloes_s * Math.exp(0.5 * normal(rng)), 1, 15) * 1000);
  }
  return Math.round(1000 + Math.exp(rng() * 2.1) * 800); // ~1,8 s..7,5 s com cauda
}

export function duracaoPlano(plano: Passo[]): number {
  return plano.reduce((acc, p) => acc + ('ms' in p ? p.ms : 0), 0);
}

function capar(passos: Passo[], teto: number): Passo[] {
  const total = duracaoPlano(passos);
  if (total <= teto) return passos;
  const fator = teto / total;
  return passos.map(
    (p): Passo => ('ms' in p ? { ...p, ms: Math.max(1, Math.floor(p.ms * fator)) } : { ...p }),
  );
}

/** Typo plausível: troca duas letras adjacentes no meio de uma palavra ≥ 4 letras. */
export function injetarTypo(
  texto: string,
  rng: () => number,
): { texto: string; correta: string } | null {
  const palavras = texto.split(' ');
  const idx = palavras.map((w, i) => ({ w, i })).filter(({ w }) => /^[a-zà-ú]{4,}$/i.test(w));
  if (!idx.length) return null;
  const { w, i } = idx[Math.floor(rng() * idx.length)] as { w: string; i: number };
  const pos = 1 + Math.floor(rng() * (w.length - 2));
  const trocada = w.slice(0, pos) + w[pos + 1] + w[pos] + w.slice(pos + 2);
  if (trocada === w) return null;
  const out = [...palavras];
  out[i] = trocada;
  return { texto: out.join(' '), correta: w };
}
