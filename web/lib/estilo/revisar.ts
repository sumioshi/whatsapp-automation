/**
 * Veredito sobre um rascunho antes do envio. Código não escreve: veta e diz
 * o que trocar. Bloqueio (tratamento errado, confissão de culpa) nunca passa;
 * o resto soma num score explicável comparado ao jeito real do operador.
 */
import { avisoDeTratamento, tratamentoErrado } from "../voz-guard";
import { type Culpa, contarDesculpas, detectarCulpa } from "./culpa";
import { pedeAval, revelaAutomacao } from "./identidade";
import type { EntradaRepeticao, Hit } from "./repeticao";
import { scoreRepeticao } from "./repeticao";
import { detectarTells, type TellId } from "./tells";

export interface EntradaRevisao extends EntradaRepeticao {
  ignorarScore?: boolean;
  /** Mensagens da conta nos últimos minutos: balão idêntico a uma delas é bloqueio. */
  minhasRecentes?: string[];
  /** Primeiro nome do operador: citá-lo na terceira pessoa entrega a automação. */
  nomeOperador?: string;
}

/** Compara balões ignorando caixa, espaços e pontuação final (mesma regra do coletor). */
export function normalizarBalao(t: string): string {
  return t
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s.!?…]+$/u, "");
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

/**
 * Só o que nunca passa: balão repetido, tratamento errado, confissão de culpa e
 * texto que revela a automação (o agente dizendo que é IA, ou o operador na
 * terceira pessoa; `nomeOperador` só vem do MCP, a equipe é outra pessoa).
 * `culpas` é a detecção do texto já feita por quem chama (o `revisar` usa a
 * mesma lista para os hits); sem ela, detecta aqui.
 */
export function bloqueiosDe(
  baloes: string[],
  minhasRecentes: string[] = [],
  culpas: Culpa[] = detectarCulpa(baloes.join("\n")),
  nomeOperador?: string,
): Hit[] {
  const texto = baloes.join("\n");
  const bloqueios: Hit[] = [];
  const recentes = new Set(minhasRecentes.map(normalizarBalao).filter(Boolean));
  const repetidos = baloes.filter((b) => recentes.has(normalizarBalao(b)));
  if (repetidos.length) {
    bloqueios.push({
      regra: "repetido",
      peso: 0,
      motivo: `balão idêntico a mensagem sua enviada há menos de 30 min: ${repetidos.map((b) => `"${b}"`).join(", ")}`,
      sugestao: "tira esse balão; o cliente já recebeu. Se for retomar, diz só o que é novo",
    });
  }
  const pron = tratamentoErrado(texto);
  if (pron.length) bloqueios.push({ regra: "tratamento", peso: 0, motivo: avisoDeTratamento(pron), sugestao: "você/vc, seu/sua" });
  for (const c of culpas) {
    if (c.grupo === "A") bloqueios.push({ regra: "culpa", peso: 0, motivo: `confissão de culpa: "${c.trecho}"`, sugestao: c.sugestao });
  }
  const revela = revelaAutomacao(texto, nomeOperador);
  if (revela.length) {
    bloqueios.push({
      regra: "revela_ia",
      peso: 0,
      motivo: `o texto entrega que não é o operador: ${revela.map((t) => `"${t}"`).join(", ")}`,
      sugestao: "escreva como o próprio operador, em primeira pessoa; se perguntaram se é IA, não responda e chame o operador",
    });
  }
  const aval = pedeAval(texto);
  if (aval.length) {
    bloqueios.push({
      regra: "pede_aval",
      peso: 0,
      motivo: `quem escreve é o dono, não pede aval a ninguém: ${aval.map((t) => `"${t}"`).join(", ")}`,
      sugestao: "decida ou diga o próximo passo em primeira pessoa ('vou ver aqui e te falo'); se a decisão é do operador, não responda e chame ele",
    });
  }
  return bloqueios;
}

export function revisar(e: EntradaRevisao): Revisao {
  const texto = e.baloes.join("\n");
  const culpas = detectarCulpa(texto);
  const bloqueios: Hit[] = bloqueiosDe(e.baloes, e.minhasRecentes, culpas, e.nomeOperador);
  const hits: Hit[] = [];

  let minimizador = 0;
  for (const c of culpas) {
    if (c.grupo === "B") hits.push({ regra: "acidente", peso: c.peso, motivo: `narra acidente: "${c.trecho}"`, sugestao: c.sugestao });
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
