/**
 * Baseline de estilo: com que frequência uma feature aparece nas mensagens
 * do operador. O guard compara a janela recente contra isso (z-score), então
 * um traço só vira hit quando destoa DELE, não de uma regra abstrata.
 * Só mensagens que ele mesmo escreveu contam: as da automação contaminariam.
 */
import { primeiraPalavra, tokenizar } from "./texto";
import { temTell } from "./tells";

export type Feature =
  | "dois_pontos_intro"
  | "travessao"
  | "ponto_final"
  | "exclamacao"
  | "pergunta"
  | "triade"
  | "nao_so_mas"
  | "bullets"
  | "negrito"
  | "emoji"
  | "maiuscula"
  | "parenteses";

export const FEATURES: Feature[] = [
  "dois_pontos_intro", "travessao", "ponto_final", "exclamacao", "pergunta", "triade",
  "nao_so_mas", "bullets", "negrito", "emoji", "maiuscula", "parenteses",
];

const EMOJI_RE = /\p{Extended_Pictographic}/u;

export function temFeature(f: Feature, texto: string): boolean {
  switch (f) {
    case "exclamacao": return texto.includes("!");
    case "pergunta": return texto.includes("?");
    case "emoji": return EMOJI_RE.test(texto);
    case "maiuscula": return /^\s*\p{Lu}/u.test(texto);
    case "parenteses": return texto.includes("(");
    default: return temTell(f, texto);
  }
}

export interface Baseline {
  n: number;
  origem: "padrao" | "chat";
  p: Record<Feature, number>;
  distinct2p10: number;
  cvP10: number;
  aberturas: Record<string, number>;
  tamanhoMediana: number;
}

export const PRE_AUTOMACAO = "2026-06-01";

export function elegivelParaBaseline(m: { fromMe?: boolean; type?: string; text?: string | null; timestamp: string; origem?: string }): boolean {
  if (!m.fromMe || m.type !== "text" || !m.text?.trim()) return false;
  if (m.origem === "celular" || m.origem === "web") return true;
  if (m.origem) return false;
  return m.timestamp < PRE_AUTOMACAO;
}

export function distinct2(tokens: string[]): number {
  if (tokens.length < 2) return 0;
  const big = tokens.slice(1).map((t, i) => `${tokens[i]} ${t}`);
  return new Set(big).size / big.length;
}

export function cvTamanho(textos: string[]): number {
  const n = textos.map((t) => tokenizar(t).length);
  const media = n.reduce((a, b) => a + b, 0) / (n.length || 1);
  if (!media) return 0;
  const varp = n.reduce((a, b) => a + (b - media) ** 2, 0) / n.length;
  return Math.sqrt(varp) / media;
}

function percentil(vals: number[], p: number): number {
  if (!vals.length) return 0;
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] ?? 0;
}

export function calcularBaseline(textos: string[], origem: "padrao" | "chat" = "chat"): Baseline {
  const n = textos.length || 1;
  const p = Object.fromEntries(FEATURES.map((f) => [f, textos.filter((t) => temFeature(f, t)).length / n])) as Record<Feature, number>;
  const ab = new Map<string, number>();
  for (const t of textos) {
    const w = primeiraPalavra(t);
    if (w) ab.set(w, (ab.get(w) ?? 0) + 1);
  }
  const aberturas = Object.fromEntries([...ab.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([w, c]) => [w, c / n]));
  const W = 5;
  const d2: number[] = [];
  const cv: number[] = [];
  for (let i = 0; i + W <= textos.length; i++) {
    const jan = textos.slice(i, i + W);
    d2.push(distinct2(jan.flatMap(tokenizar)));
    cv.push(cvTamanho(jan));
  }
  return {
    n: textos.length,
    origem,
    p,
    distinct2p10: percentil(d2, 0.1),
    cvP10: percentil(cv, 0.1),
    aberturas,
    tamanhoMediana: percentil(textos.map((t) => t.length), 0.5),
  };
}

/** Medido em 2.405 mensagens profissionais do operador, antes da automação. */
export const BASELINE_PADRAO: Baseline = {
  n: 2405,
  origem: "padrao",
  p: {
    dois_pontos_intro: 0.039, travessao: 0.004, ponto_final: 0.04, exclamacao: 0.108, pergunta: 0.215,
    triade: 0.013, nao_so_mas: 0, bullets: 0.02, negrito: 0.006, emoji: 0.069, maiuscula: 0.752, parenteses: 0.027,
  },
  distinct2p10: 0.45,
  cvP10: 0.22,
  aberturas: { opa: 0.039, boa: 0.029, show: 0.022, vou: 0.021, bom: 0.02, olá: 0.02, ok: 0.015, só: 0.014, pode: 0.012, tudo: 0.012 },
  tamanhoMediana: 24,
};
