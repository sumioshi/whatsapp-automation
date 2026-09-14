/**
 * Veredito sobre um rascunho antes do envio. Código não escreve: veta e diz
 * o que trocar. Bloqueio (tratamento errado, confissão de culpa) nunca passa;
 * o resto soma num score explicável comparado ao jeito real do operador.
 */
import { avisoDeTratamento, tratamentoErrado } from "../voz-guard";
import { contarDesculpas, detectarCulpa } from "./culpa";
import type { EntradaRepeticao, Hit } from "./repeticao";
import { scoreRepeticao } from "./repeticao";
import { detectarTells, type TellId } from "./tells";

export interface EntradaRevisao extends EntradaRepeticao {
  ignorarScore?: boolean;
}

export interface Revisao {
  ok: boolean;
  bloqueios: Hit[];
  score: number;
  hits: Hit[];
  sugestoes: string[];
  resumo: string;
}

export const LIMIAR = 4;
/** Limiar efetivo; a calibração (scripts/estilo-baseline.ts) pode ajustar em tempo de execução. */
export const CONFIG_REVISAO = { limiar: LIMIAR };

const PESO_TELL: Partial<Record<TellId, number>> = { dois_pontos_intro: 2, travessao: 2, nao_so_mas: 2, markdown: 2, bullets: 2 };
const TETO_MINIMIZADOR = 3;

export function revisar(e: EntradaRevisao): Revisao {
  const texto = e.baloes.join("\n");
  const bloqueios: Hit[] = [];
  const hits: Hit[] = [];

  const pron = tratamentoErrado(texto);
  if (pron.length) bloqueios.push({ regra: "tratamento", peso: 0, motivo: avisoDeTratamento(pron), sugestao: "você/vc, seu/sua" });

  let minimizador = 0;
  for (const c of detectarCulpa(texto)) {
    if (c.grupo === "A") bloqueios.push({ regra: "culpa", peso: 0, motivo: `confissão de culpa: "${c.trecho}"`, sugestao: c.sugestao });
    else if (c.grupo === "B") hits.push({ regra: "acidente", peso: c.peso, motivo: `narra acidente: "${c.trecho}"`, sugestao: c.sugestao });
    else if (c.grupo === "C") hits.push({ regra: "drama", peso: c.peso, motivo: `dramatiza: "${c.trecho}"`, sugestao: c.sugestao });
    else if (c.grupo === "D" && minimizador < TETO_MINIMIZADOR) {
      minimizador += c.peso;
      hits.push({ regra: "minimizador", peso: c.peso, motivo: `minimiza: "${c.trecho}"`, sugestao: c.sugestao });
    } else if (c.grupo === "F") hits.push({ regra: "sem_alternativa", peso: c.peso, motivo: `"${c.trecho}" sem dizer o que dá`, sugestao: c.sugestao });
  }
  const desculpasAgora = contarDesculpas(texto);
  const desculpasRecentes = e.ultimasMinhas.reduce((a, m) => a + contarDesculpas(m), 0);
  if (desculpasAgora >= 2 || (desculpasAgora === 1 && desculpasRecentes >= 1)) {
    hits.push({ regra: "desculpa", peso: 3, motivo: `${desculpasAgora} desculpa(s) no rascunho e ${desculpasRecentes} nas últimas ${e.ultimasMinhas.length}`, sugestao: "uma vez por incidente, curta, depois do estado" });
  }

  const porRegra = new Map<string, Hit>();
  for (const t of detectarTells(texto)) {
    porRegra.set(t.id, { regra: t.id, peso: PESO_TELL[t.id] ?? 1, motivo: `tell de IA: ${t.id}${t.trecho ? ` ("${t.trecho}")` : ""}`, sugestao: t.sugestao });
  }
  const rep = scoreRepeticao(e);
  for (const h of rep.hits) {
    const atual = porRegra.get(h.regra);
    if (!atual || h.peso > atual.peso) porRegra.set(h.regra, h);
    else if (atual && h.peso === atual.peso) porRegra.set(h.regra, { ...atual, motivo: h.motivo });
  }
  hits.push(...porRegra.values());

  const score = hits.reduce((a, h) => a + h.peso, 0);
  const grave = hits.some((h) => h.peso >= 3);
  const ok = bloqueios.length === 0 && (e.ignorarScore === true || (score < CONFIG_REVISAO.limiar && !grave));
  const sugestoes = [...new Set([...bloqueios, ...hits].map((h) => h.sugestao))];
  const resumo = bloqueios.length
    ? `bloqueado: ${bloqueios.map((b) => b.regra).join(", ")}`
    : `score ${score} (limiar ${CONFIG_REVISAO.limiar})${grave ? ", com hit grave" : ""}: ${hits.map((h) => h.regra).join(", ") || "limpo"}`;
  return { ok, bloqueios, score, hits, sugestoes, resumo };
}
