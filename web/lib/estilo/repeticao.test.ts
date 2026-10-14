import { describe, expect, it } from "vitest";
import { BASELINE_PADRAO } from "./baseline";
import { assinaturaEsqueleto, scoreRepeticao, zBinomial } from "./repeticao";

const base = { baseline: BASELINE_PADRAO, ultimasDoCliente: [] as string[] };
const regras = (r: { hits: { regra: string }[] }) => r.hits.map((h) => h.regra);

describe("abertura", () => {
  it("tolera 2 e marca a partir da 3ª na janela", () => {
    const duas = scoreRepeticao({ ...base, baloes: ["opa, subi"], ultimasMinhas: ["opa, vi", "beleza", "vou olhar", "fechou", "amanhã sai"] });
    expect(regras(duas)).not.toContain("abertura");
    const tres = scoreRepeticao({ ...base, baloes: ["opa, subi"], ultimasMinhas: ["opa, vi", "opa, beleza", "vou olhar", "fechou", "amanhã sai"] });
    expect(regras(tres)).toContain("abertura");
    expect(tres.hits.find((h) => h.regra === "abertura")?.peso).toBe(2);
    const quatro = scoreRepeticao({ ...base, baloes: ["opa, subi"], ultimasMinhas: ["opa, vi", "opa, beleza", "opa, olha", "fechou", "amanhã sai"] });
    expect(quatro.hits.find((h) => h.regra === "abertura")?.peso).toBe(3);
  });
});

describe("palavra", () => {
  it("marca palavra minha repetida e isenta vocabulário do cliente", () => {
    const r = scoreRepeticao({ ...base, baloes: ["ajustei o filtro"], ultimasMinhas: ["ajustei o painel", "ajustei a conta", "subi", "ok", "vou ver"] });
    expect(regras(r)).toContain("palavra");
    const isento = scoreRepeticao({ ...base, baloes: ["o relatório saiu"], ultimasMinhas: ["o relatório tá quase", "relatório amanhã", "ok", "vou ver", "subi"], ultimasDoCliente: ["e o relatório?"] });
    expect(regras(isento)).not.toContain("palavra");
  });
  it("peso 2 quando aparece em 3+ das últimas (nunca bloqueia sozinha)", () => {
    const r = scoreRepeticao({ ...base, baloes: ["ajustei o filtro"], ultimasMinhas: ["ajustei o painel", "ajustei a conta", "ajustei o total", "ok", "vou ver"] });
    expect(r.hits.find((h) => h.regra === "palavra")?.peso).toBe(2);
  });
});

describe("parafrase", () => {
  it("metade dos bigramas já vistos numa msg anterior", () => {
    const r = scoreRepeticao({ ...base, baloes: ["subi tudo no ar, pode testar de novo quando puder"], ultimasMinhas: ["subi tudo no ar, pode testar de novo quando der", "ok", "boa", "vou ver", "fechou"] });
    expect(regras(r)).toContain("parafrase");
  });
  it("ignora rascunho curto", () => {
    const r = scoreRepeticao({ ...base, baloes: ["subi tudo"], ultimasMinhas: ["subi tudo", "ok", "boa", "vou ver", "fechou"] });
    expect(regras(r)).not.toContain("parafrase");
  });
});

describe("feature vs baseline", () => {
  it("z-score binomial", () => {
    expect(zBinomial(3, 6, 0.039)).toBeGreaterThan(3);
    expect(zBinomial(0, 6, 0.039)).toBeLessThan(0);
  });
  it("dois-pontos em 3 de 6 vira hit; 1 de 6 não", () => {
    const r = scoreRepeticao({ ...base, baloes: ["A segunda: alinhei"], ultimasMinhas: ["A primeira: corrigi", "Assim: fica", "ok", "boa", "vou ver"] });
    expect(regras(r)).toContain("dois_pontos_intro");
    const um = scoreRepeticao({ ...base, baloes: ["A segunda: alinhei"], ultimasMinhas: ["corrigi", "fica", "ok", "boa", "vou ver"] });
    expect(regras(um)).not.toContain("dois_pontos_intro");
  });
  it("pergunta e emoji nunca viram hit", () => {
    const r = scoreRepeticao({ ...base, baloes: ["pode ser? 👍"], ultimasMinhas: ["pode? 👍", "vai? 👍", "ok? 👍", "boa? 👍", "sim? 👍"] });
    expect(regras(r)).not.toContain("pergunta");
    expect(regras(r)).not.toContain("emoji");
  });
});

describe("ritmo, esqueleto, saudação, resposta redonda", () => {
  it("ritmo: todas com o mesmo tamanho", () => {
    const iguais = Array(5).fill("subi o ajuste do painel hoje cedo");
    const r = scoreRepeticao({ ...base, baloes: ["subi o ajuste do filtro hoje cedo"], ultimasMinhas: iguais });
    expect(regras(r)).toContain("ritmo");
  });
  it("esqueleto: mesma assinatura em 3 seguidas", () => {
    expect(assinaturaEsqueleto("Subi o ajuste. Pode testar?")).toBe(assinaturaEsqueleto("Corrigi o total. Consegue olhar?"));
    const r = scoreRepeticao({ ...base, baloes: ["Alinhei a coluna. Dá pra conferir?"], ultimasMinhas: ["ok", "boa", "vou ver", "Subi o ajuste. Pode testar?", "Corrigi o total. Consegue olhar?"] });
    expect(regras(r)).toContain("esqueleto");
  });
  it("saudação com menos de 1 h desde a minha última", () => {
    const r = scoreRepeticao({ ...base, baloes: ["opa, subi"], ultimasMinhas: ["vou ver"], intervaloDesdeMinhaUltima_s: 600 });
    expect(regras(r)).toContain("saudacao");
    const fria = scoreRepeticao({ ...base, baloes: ["opa, subi"], ultimasMinhas: ["vou ver"], intervaloDesdeMinhaUltima_s: 90_000 });
    expect(regras(fria)).not.toContain("saudacao");
  });
  it("resposta redonda: longa, sem pergunta, validação na abertura", () => {
    const longo = "Ótimo ponto, fiz a conferência geral e encontrei três itens que já foram corrigidos e conferidos um por um no painel";
    const r = scoreRepeticao({ ...base, baloes: [longo, `${longo} de novo`], ultimasMinhas: [] });
    expect(regras(r)).toContain("resposta_redonda");
  });
  it("janela vazia e rascunho limpo dão score 0", () => {
    expect(scoreRepeticao({ ...base, baloes: ["subi, pode testar?"], ultimasMinhas: [] }).score).toBe(0);
  });
});

describe("calibração no corpus real (2026-09-14)", () => {
  it("exclamação em excesso não vira hit: o operador usa mais '!' que a automação", () => {
    const r = scoreRepeticao({ ...base, baloes: ["fechou!"], ultimasMinhas: ["boa!", "show!", "top!", "vai!", "sim!"] });
    expect(regras(r)).not.toContain("exclamacao");
  });
  it("ritmo é informativo: aparece com peso 0", () => {
    const iguais = Array(5).fill("subi o ajuste do painel hoje cedo");
    const r = scoreRepeticao({ ...base, baloes: ["subi o ajuste do filtro hoje cedo"], ultimasMinhas: iguais });
    expect(r.hits.find((h) => h.regra === "ritmo")?.peso).toBe(0);
  });
  it("feature em excesso só conta com 3+ mensagens da janela", () => {
    const r = scoreRepeticao({ ...base, baloes: ["Assim: fica"], ultimasMinhas: ["Um: dois", "ok", "boa", "vou", "sim"] });
    expect(regras(r)).not.toContain("dois_pontos_intro");
  });
});

describe("tamanho (balao_longo e janela_longa vs mediana do operador)", () => {
  it("marca balao_longo (peso 2) quando balão passa de 180 chars ou total passa de 260 chars", () => {
    const longo190 = "fiz a conferência completa do módulo de exportação do relatório mensal e já subi o ajuste na fila de processamento para você testar assim que puder hoje à tarde com calma na sua conta principal";
    expect(longo190.length).toBeGreaterThan(180);
    const r = scoreRepeticao({ ...base, baloes: [longo190], ultimasMinhas: [] });
    expect(regras(r)).toContain("balao_longo");
    expect(r.hits.find((h) => h.regra === "balao_longo")?.peso).toBe(2);
  });

  it("marca balao_longo grave (peso 3) quando balão é paredão (> 350 chars, > 240 chars com 3+ frases, ou 2+ balões > 300 chars)", () => {
    const paredao =
      "Fiz a conferência completa do módulo de exportação do relatório mensal. Também revisei todas as permissões de acesso do painel administrativo para garantir que nenhum dado ficasse de fora na listagem geral. Já deixei tudo pronto no ambiente de homologação para você validar hoje à tarde";
    expect(paredao.length).toBeGreaterThan(240);
    const r = scoreRepeticao({ ...base, baloes: [paredao], ultimasMinhas: [] });
    expect(regras(r)).toContain("balao_longo");
    expect(r.hits.find((h) => h.regra === "balao_longo")?.peso).toBe(3);
  });

  it("marca janela_longa (peso 2) quando 3 mensagens seguidas têm ≥ 110 chars", () => {
    const msg120 = "verifiquei o cálculo da listagem de ontem e já deixei separado o lote que precisava ser reprocessado hoje cedo no servidor";
    expect(msg120.length).toBeGreaterThanOrEqual(110);
    const r = scoreRepeticao({
      ...base,
      baloes: ["conferi também a segunda parte do arquivo que faltava validar e deixei pronto para rodarmos na janela da tarde sem impacto"],
      ultimasMinhas: ["ok", msg120, "atualizei a regra de filtragem do relatório para considerar apenas os registros confirmados na semana passada pelo financeiro"],
    });
    expect(regras(r)).toContain("janela_longa");
    expect(r.hits.find((h) => h.regra === "janela_longa")?.peso).toBe(2);
  });
});

