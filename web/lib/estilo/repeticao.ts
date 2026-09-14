/**
 * Repetição em janela: o rascunho contra as últimas mensagens da conta no
 * chat, e a janela inteira contra o baseline do operador. Métricas de corpus
 * não pegam "a mesma abertura três vezes seguidas"; janela pega.
 */
import type { Baseline, Feature } from "./baseline";
import { cvTamanho, distinct2, temFeature } from "./baseline";
import { frases, palavrasDeConteudo, primeiraPalavra, tokenizar } from "./texto";
import { SUGESTAO_TELL, temTell } from "./tells";

export interface Hit {
  regra: string;
  peso: number;
  motivo: string;
  sugestao: string;
}

export interface EntradaRepeticao {
  baloes: string[];
  ultimasMinhas: string[];
  ultimasDoCliente: string[];
  baseline: Baseline;
  intervaloDesdeMinhaUltima_s?: number;
}

export const SAUDACAO_RE = /^\s*(opa|oi|olá|ola|bom dia|boa tarde|boa noite|e aí|e ai|fala)\b/i;

/** Features em que o sinal é excesso (o operador usa pouco). Pergunta/emoji/maiúscula são déficit, não hit. */
const FEATURES_EXCESSO: Feature[] = ["dois_pontos_intro", "travessao", "ponto_final", "exclamacao", "triade", "nao_so_mas", "bullets", "negrito", "parenteses"];

export function zBinomial(k: number, n: number, p: number): number {
  const pp = Math.min(Math.max(p, 0.005), 0.995);
  return (k - n * pp) / Math.sqrt(n * pp * (1 - pp));
}

const VERBO_1P_PRET_RE = /^\s*\p{L}+(ei|i|ri|si|zi)\b/u;

export function assinaturaEsqueleto(texto: string): string {
  const fs = frases(texto);
  const pergunta = texto.trim().endsWith("?");
  const verbo = VERBO_1P_PRET_RE.test(texto) && /^\s*(subi|fiz|corrigi|ajustei|alinhei|mandei|deixei|troquei|mudei|arrumei|coloquei|atualizei|resolvi|terminei|finalizei|consegui|vi|olhei|conferi|testei|abri|fechei)/i.test(texto);
  return `${fs.length}|${pergunta ? "?" : "."}|${verbo ? "v1" : "-"}`;
}

function bigramas(t: string): Set<string> {
  const w = tokenizar(t);
  return new Set(w.slice(1).map((x, i) => `${w[i]} ${x}`));
}

export function scoreRepeticao(e: EntradaRepeticao): { score: number; hits: Hit[] } {
  const hits: Hit[] = [];
  const rascunho = e.baloes.join("\n");
  const janela = [...e.ultimasMinhas, ...e.baloes];
  const n = janela.length;
  const topico = new Set(e.ultimasDoCliente.flatMap(palavrasDeConteudo));

  // 1. abertura
  const ab = primeiraPalavra(e.baloes[0] ?? "");
  if (ab) {
    const rep = e.ultimasMinhas.filter((m) => primeiraPalavra(m) === ab).length;
    if (rep >= 2) hits.push({ regra: "abertura", peso: rep >= 3 ? 3 : 2, motivo: `"${ab}" abre ${rep + 1} das últimas ${n} mensagens`, sugestao: "começa pelo fato ou pela resposta, sem a palavra de abertura" });
  }

  // 2. palavra introduzida por mim e repetida
  const minhas = e.ultimasMinhas.map((m) => new Set(palavrasDeConteudo(m)));
  for (const w of palavrasDeConteudo(rascunho)) {
    if (topico.has(w)) continue;
    const k = minhas.filter((s) => s.has(w)).length;
    if (k >= 2) hits.push({ regra: "palavra", peso: k >= 3 ? 2 : 1, motivo: `"${w}…" já apareceu em ${k} das últimas ${e.ultimasMinhas.length} mensagens`, sugestao: "troca por sinônimo ou reestrutura a frase" });
  }

  // 3. quase-paráfrase
  const bd = bigramas(rascunho);
  if (bd.size >= 5) {
    for (const m of e.ultimasMinhas) {
      const bm = bigramas(m);
      if (bm.size < 5) continue;
      const inter = [...bd].filter((x) => bm.has(x)).length / bd.size;
      if (inter >= 0.5) {
        hits.push({ regra: "parafrase", peso: 3, motivo: `${Math.round(inter * 100)}% dos pares de palavras já estavam numa mensagem anterior`, sugestao: "diz só o que é novo, ou reage em vez de repetir" });
        break;
      }
    }
  }

  // 4. feature vs baseline (excesso)
  for (const f of FEATURES_EXCESSO) {
    const k = janela.filter((t) => temFeature(f, t)).length;
    if (k > 0 && zBinomial(k, n, e.baseline.p[f]) >= 3) {
      const sug = f in SUGESTAO_TELL ? SUGESTAO_TELL[f as keyof typeof SUGESTAO_TELL] : "usa como ele usa: quase nunca";
      hits.push({ regra: f, peso: 2, motivo: `${k} de ${n} mensagens com ${f}; o operador usa em ${(e.baseline.p[f] * 100).toFixed(1)}%`, sugestao: sug });
    }
  }

  // 5. ritmo
  const toks = janela.flatMap(tokenizar);
  if (toks.length >= 30 && n >= 3) {
    const d2 = distinct2(toks);
    const cv = cvTamanho(janela);
    if (d2 < e.baseline.distinct2p10) hits.push({ regra: "ritmo", peso: 1, motivo: `diversidade de pares ${d2.toFixed(2)} abaixo do piso dele ${e.baseline.distinct2p10}`, sugestao: "varia vocabulário e estrutura" });
    else if (cv < e.baseline.cvP10) hits.push({ regra: "ritmo", peso: 1, motivo: `todas as mensagens com tamanho parecido (CV ${cv.toFixed(2)})`, sugestao: "varia: uma curta, uma de duas frases" });
  }

  // 6. esqueleto
  const ult2 = e.ultimasMinhas.slice(-2);
  if (ult2.length === 2 && e.baloes[0]) {
    const a = assinaturaEsqueleto(e.baloes[0]);
    if (ult2.every((m) => assinaturaEsqueleto(m) === a) && a.endsWith("v1")) {
      hits.push({ regra: "esqueleto", peso: 2, motivo: "mesma estrutura (afirmação com verbo em 1ª pessoa + pergunta) três vezes seguidas", sugestao: "muda a forma: só o fato, ou só a pergunta, ou uma reação" });
    }
  }

  // 7. saudação reflexa
  if (e.intervaloDesdeMinhaUltima_s !== undefined && e.intervaloDesdeMinhaUltima_s < 3600 && SAUDACAO_RE.test(e.baloes[0] ?? "")) {
    hits.push({ regra: "saudacao", peso: 2, motivo: `saudação com ${Math.round(e.intervaloDesdeMinhaUltima_s / 60)} min desde a sua última mensagem`, sugestao: "entra direto no assunto" });
  }

  // 8. resposta redonda (sinal fraco)
  const longos = e.baloes.every((b) => tokenizar(b).length >= 15);
  const semPergunta = !e.baloes.some((b) => b.trim().endsWith("?"));
  if (e.baloes.length && longos && semPergunta && temTell("validacao_abertura", e.baloes[0] ?? "")) {
    hits.push({ regra: "resposta_redonda", peso: 1, motivo: "tudo longo, sem pergunta e abrindo com validação", sugestao: "responde uma parte e devolve uma pergunta" });
  }

  return { score: hits.reduce((a, h) => a + h.peso, 0), hits };
}
