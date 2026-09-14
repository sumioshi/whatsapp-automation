/**
 * Resumo numérico do que a conta escreveu nas últimas mensagens do chat,
 * com instruções positivas para variar. Entra no prompt logo antes de
 * redigir: restrição dada cedo some no multi-turno; número dado na hora fica.
 */
import type { Baseline } from "./baseline";
import { temFeature } from "./baseline";
import { SAUDACAO_RE, zBinomial } from "./repeticao";
import { primeiraPalavra, tokenizar } from "./texto";

export interface ResumoEstilo {
  ultimas: number;
  aberturas: string[];
  verbos_de_abertura: string[];
  pontuacao: { dois_pontos_intro: number; ponto_final: number; exclamacao: number; pergunta: number; emoji: number; travessao: number };
  tamanhos: number[];
  instrucoes: string[];
}

export const VERBOS_ENTREGA_RE = /^(ajustei|fiz|corrigi|mandei|subi|deixei|troquei|mudei|arrumei|coloquei|atualizei|resolvi|terminei|finalizei|consegui|alinhei|conferi|testei)$/i;

export function resumirEstilo(ultimasMinhas: string[], baseline: Baseline): ResumoEstilo {
  const n = ultimasMinhas.length;
  const aberturas = ultimasMinhas.map(primeiraPalavra);
  const verbos = aberturas.filter((a) => VERBOS_ENTREGA_RE.test(a));
  const conta = (f: Parameters<typeof temFeature>[0]) => ultimasMinhas.filter((t) => temFeature(f, t)).length;
  const pontuacao = {
    dois_pontos_intro: conta("dois_pontos_intro"),
    ponto_final: conta("ponto_final"),
    exclamacao: conta("exclamacao"),
    pergunta: conta("pergunta"),
    emoji: conta("emoji"),
    travessao: conta("travessao"),
  };
  const tamanhos = ultimasMinhas.map((t) => t.length);
  const instrucoes: string[] = [];
  if (n) {
    const freq = new Map<string, number>();
    for (const a of aberturas) if (a) freq.set(a, (freq.get(a) ?? 0) + 1);
    for (const [a, c] of freq) if (c >= 2 && (SAUDACAO_RE.test(a) || c >= 3)) instrucoes.push(`abre pelo fato, sem '${a}' (${c} das últimas ${n})`);
    const fv = new Map<string, number>();
    for (const v of verbos) fv.set(v.toLowerCase(), (fv.get(v.toLowerCase()) ?? 0) + 1);
    for (const [v, c] of fv) if (c >= 2) instrucoes.push(`'${v}' já abriu ${c} mensagens; usa outro verbo ou reestrutura`);
    const excesso: Array<[keyof typeof pontuacao, string]> = [
      ["dois_pontos_intro", "dois-pontos apareceu em {k} das {n}; vírgula, ponto ou balão novo"],
      ["ponto_final", "ponto final em {k} das {n}; balão termina sem ponto"],
      ["travessao", "travessão em {k} das {n}; vírgula ou balão novo"],
      ["exclamacao", "exclamação em {k} das {n}; deixa o fato falar"],
    ];
    for (const [f, msg] of excesso) {
      const k = pontuacao[f];
      if (k > 0 && zBinomial(k, n, baseline.p[f]) >= 2) instrucoes.push(msg.replace("{k}", String(k)).replace("{n}", String(n)));
    }
    if (n >= 3 && pontuacao.pergunta === 0 && baseline.p.pergunta > 0.1) instrucoes.push(`nenhuma pergunta nas últimas ${n}; se couber, devolve uma`);
    if (n >= 3) {
      const palavras = ultimasMinhas.map((t) => tokenizar(t).length);
      const media = palavras.reduce((a, b) => a + b, 0) / n;
      if (media > 0 && palavras.every((p) => Math.abs(p - media) <= 0.3 * media)) instrucoes.push("tamanhos parecidos; uma curta e uma de duas frases");
    }
  }
  return { ultimas: n, aberturas, verbos_de_abertura: verbos, pontuacao, tamanhos, instrucoes };
}
