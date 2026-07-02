/**
 * Partitura da entrega humanizada: dado os balões, gera a sequência de passos
 * (visto, pausas, digitando, envios) que o executor do gateway toca. Puro, com
 * RNG injetável — o realismo vem da IRREGULARIDADE (jitter, log-normal), nunca
 * de intervalos uniformes. Teto global de 45s: o /send segura o HTTP até o fim.
 */
import type { PerfilEnvio } from './baloes';
import { PERFIL_DEFAULT } from './baloes';

export type Passo =
  | { tipo: 'visto' }
  | { tipo: 'pausa'; ms: number }
  | { tipo: 'digitando'; ms: number }
  | { tipo: 'enviar'; texto: string; typoAntes?: string };

export interface CtxEntrega {
  typos?: boolean;
  foraDoExpediente?: boolean;
  msgRecebidaChars?: number;
  rng?: () => number;
}

export const TETO_MS = 45_000;
const TYPO_CHANCE = 0.03;

export function planoDeEntrega(
  baloes: string[],
  _perfil: PerfilEnvio = PERFIL_DEFAULT,
  ctx: CtxEntrega = {},
): Passo[] {
  const rng = ctx.rng ?? Math.random;
  const passos: Passo[] = [{ tipo: 'visto' }];

  // pausa de "leitura": 2-5s base + ~20ms/char da msg recebida; fora do expediente ×2.5
  let leitura = 2000 + rng() * 3000 + Math.min((ctx.msgRecebidaChars ?? 0) * 20, 6000);
  if (ctx.foraDoExpediente) leitura *= 2.5;
  passos.push({ tipo: 'pausa', ms: Math.round(leitura) });

  baloes.forEach((texto, i) => {
    if (i > 0) passos.push({ tipo: 'pausa', ms: pausaEntreBaloes(rng) });
    passos.push({ tipo: 'digitando', ms: Math.round(texto.length * (40 + rng() * 40)) });
    const typoAntes = ctx.typos && rng() < TYPO_CHANCE ? (injetarTypo(texto, rng) ?? undefined) : undefined;
    passos.push({ tipo: 'enviar', texto, ...(typoAntes ? { typoAntes } : {}) });
  });

  return capar(passos);
}

/** 1-8s com cauda (log-normal aproximada): quase sempre curto, às vezes longo. */
function pausaEntreBaloes(rng: () => number): number {
  const u = rng();
  return Math.round(1000 + Math.exp(u * 2.1) * 800); // ~1.8s..7.5s
}

/** Escala os tempos proporcionalmente se o total passar do teto. */
function capar(passos: Passo[]): Passo[] {
  const total = passos.reduce((acc, p) => acc + ('ms' in p ? p.ms : 0), 0);
  if (total <= TETO_MS) return passos;
  const fator = TETO_MS / total;
  return passos.map((p) => ('ms' in p ? { ...p, ms: Math.round(p.ms * fator) } : p));
}

/**
 * Typo plausível: troca duas letras adjacentes no meio de uma palavra ≥4 chars.
 * Devolve null se não houver palavra elegível (o chamador simplesmente não usa).
 */
export function injetarTypo(texto: string, rng: () => number): string | null {
  const palavras = texto.split(' ');
  const idx = palavras.map((w, i) => ({ w, i })).filter(({ w }) => /^[a-zà-ú]{4,}$/i.test(w));
  if (!idx.length) return null;
  const { w, i } = idx[Math.floor(rng() * idx.length)];
  const pos = 1 + Math.floor(rng() * (w.length - 2));
  const trocada = w.slice(0, pos) + w[pos + 1] + w[pos] + w.slice(pos + 2);
  if (trocada === w) return null;
  const out = [...palavras];
  out[i] = trocada;
  return out.join(' ');
}
