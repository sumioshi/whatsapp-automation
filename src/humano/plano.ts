/**
 * Partitura da entrega humanizada: dado os balões, gera a sequência de passos
 * (visto, pausas, digitando, envios) que o executor do gateway toca. Puro, com
 * RNG injetável — o realismo vem da IRREGULARIDADE (jitter, log-normal), nunca
 * de intervalos uniformes. Teto global de 45s: o /send segura o HTTP até o fim.
 */
import type { PerfilEnvio } from './baloes.js';
import { PERFIL_DEFAULT } from './baloes.js';

export type Passo =
  | { tipo: 'visto' }
  | { tipo: 'pausa'; ms: number }
  | { tipo: 'digitando'; ms: number }
  | { tipo: 'enviar'; texto: string; typoAntes?: string; typoDelayMs?: number };

export interface CtxEntrega {
  typos?: boolean;
  foraDoExpediente?: boolean;
  msgRecebidaChars?: number;
  rng?: () => number;
}

export const TETO_MS = 45_000;
const TYPO_CHANCE = 0.03;
const PISO_DIGITANDO_MS = 300;

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

  const validos = baloes.map((b) => b.trim()).filter(Boolean);
  validos.forEach((texto, i) => {
    if (i > 0) passos.push({ tipo: 'pausa', ms: pausaEntreBaloes(rng) });
    passos.push({
      tipo: 'digitando',
      ms: Math.max(PISO_DIGITANDO_MS, Math.round(texto.length * (40 + rng() * 40))),
    });
    const typoAntes =
      ctx.typos && rng() < TYPO_CHANCE ? (injetarTypo(texto, rng) ?? undefined) : undefined;
    // typoDelayMs é sorteado AQUI (no plano, com o rng semeável) — é o tempo entre
    // o envio com typo e o edit que corrige, hoje fora do teto porque o executor
    // sorteava na hora com Math.random(). Sorteando no plano, capar() consegue
    // somar/escalar esse tempo junto com os demais e o executor fica determinístico.
    const typoDelayMs = typoAntes ? Math.round(2000 + rng() * 3000) : undefined;
    passos.push({
      tipo: 'enviar',
      texto,
      ...(typoAntes ? { typoAntes } : {}),
      ...(typoDelayMs !== undefined ? { typoDelayMs } : {}),
    });
  });

  return capar(passos);
}

/** 1-8s com cauda (log-normal aproximada): quase sempre curto, às vezes longo. */
function pausaEntreBaloes(rng: () => number): number {
  const u = rng();
  return Math.round(1000 + Math.exp(u * 2.1) * 800); // ~1.8s..7.5s
}

/** Escala os tempos se o total passar do teto — e GARANTE o teto: floor no
 * escalonamento e o resíduo de arredondamento é aparado do maior passo. O
 * `typoDelayMs` (tempo do envio-com-typo até o edit corretivo) soma e escala
 * junto com os `ms` — senão o executor esperaria além do teto por fora do plano. */
function capar(passos: Passo[]): Passo[] {
  const parteExtra = (p: Passo) => (p.tipo === 'enviar' ? (p.typoDelayMs ?? 0) : 0);
  const somaPasso = (p: Passo) => ('ms' in p ? p.ms : 0) + parteExtra(p);
  const soma = (ps: Passo[]) => ps.reduce((acc, p) => acc + somaPasso(p), 0);
  const total = soma(passos);
  if (total <= TETO_MS) return passos;
  const fator = TETO_MS / total;
  const escalados = passos.map((p): Passo => {
    const base: Passo = 'ms' in p ? { ...p, ms: Math.max(1, Math.floor(p.ms * fator)) } : { ...p };
    if (base.tipo === 'enviar' && base.typoDelayMs !== undefined) {
      base.typoDelayMs = Math.max(1, Math.floor(base.typoDelayMs * fator));
    }
    return base;
  });
  const excesso = soma(escalados) - TETO_MS;
  if (excesso > 0) {
    // aparar o resíduo do maior "slot" de tempo — seja ms de pausa/digitando, seja typoDelayMs de um enviar
    type Slot = { valor: number; aparar: (novoValor: number) => void };
    const slots: Slot[] = [];
    for (const p of escalados) {
      if ('ms' in p) {
        slots.push({
          valor: p.ms,
          aparar: (v) => {
            p.ms = v;
          },
        });
      }
      if (p.tipo === 'enviar' && p.typoDelayMs !== undefined) {
        slots.push({
          valor: p.typoDelayMs,
          aparar: (v) => {
            p.typoDelayMs = v;
          },
        });
      }
    }
    const maior = slots.reduce<Slot | null>((m, s) => (!m || s.valor > m.valor ? s : m), null);
    if (maior) maior.aparar(Math.max(1, maior.valor - excesso));
  }
  return escalados;
}

/**
 * Typo plausível: troca duas letras adjacentes no meio de uma palavra ≥4 chars.
 * Devolve null se não houver palavra elegível (o chamador simplesmente não usa).
 */
export function injetarTypo(texto: string, rng: () => number): string | null {
  const palavras = texto.split(' ');
  const idx = palavras.map((w, i) => ({ w, i })).filter(({ w }) => /^[a-zà-ú]{4,}$/i.test(w));
  if (!idx.length) return null;
  const { w, i } = idx[Math.floor(rng() * idx.length)]!;
  const pos = 1 + Math.floor(rng() * (w.length - 2));
  const trocada = w.slice(0, pos) + w[pos + 1] + w[pos] + w.slice(pos + 2);
  if (trocada === w) return null;
  const out = [...palavras];
  out[i] = trocada;
  return out.join(' ');
}

/**
 * Garante uma janela mínima (visto/pausa/digitando) antes do PRIMEIRO balão sair —
 * é o tempo que o operador tem pra cancelar um envio do agente (Esc / "cancela").
 * A extensão vai no `digitando` (ele vê "digitando…" no chat), inserindo um se não
 * houver. Plano sem envio não muda.
 */
export function garantirJanela(plano: Passo[], minMs: number): Passo[] {
  const idxEnvio = plano.findIndex((p) => p.tipo === 'enviar');
  if (idxEnvio === -1) return plano;
  const antes = plano.slice(0, idxEnvio);
  const soma = antes.reduce((s, p) => s + ('ms' in p ? p.ms : 0), 0);
  if (soma >= minMs) return plano;
  const falta = minMs - soma;
  const idxDigitando = antes.map((p) => p.tipo).lastIndexOf('digitando');
  const out = plano.slice();
  if (idxDigitando === -1) {
    out.splice(idxEnvio, 0, { tipo: 'digitando', ms: falta });
  } else {
    const d = plano[idxDigitando] as { tipo: 'digitando'; ms: number };
    out[idxDigitando] = { tipo: 'digitando', ms: d.ms + falta };
  }
  return out;
}
