import { describe, expect, it } from "vitest";
import { BASELINE_PADRAO } from "./baseline";
import { resumirEstilo } from "./resumo";

describe("resumirEstilo", () => {
  it("conta aberturas, verbos, pontuação e tamanhos", () => {
    const r = resumirEstilo(["Opa, ajustei o painel", "ajustei a conta: ficou", "Subi tudo.", "opa, vou ver", "beleza"], BASELINE_PADRAO);
    expect(r.ultimas).toBe(5);
    expect(r.aberturas).toEqual(["opa", "ajustei", "subi", "opa", "beleza"]);
    expect(r.verbos_de_abertura).toEqual(["ajustei", "subi"]);
    expect(r.pontuacao.dois_pontos_intro).toBe(1);
    expect(r.pontuacao.ponto_final).toBe(1);
    expect(r.tamanhos).toHaveLength(5);
  });
  it("instruções aparecem só quando o número justifica", () => {
    const limpo = resumirEstilo(["subi", "pode testar?", "vou olhar isso amanhã cedo e te falo", "fechou", "boa"], BASELINE_PADRAO);
    expect(limpo.instrucoes).toEqual([]);
    const sujo = resumirEstilo(["Opa, ajustei: ficou.", "Opa, ajustei: subiu.", "Opa, alinhei: pronto.", "Ok: sim.", "Vou ver: hoje."], BASELINE_PADRAO);
    expect(sujo.instrucoes.join(" ")).toMatch(/opa/);
    expect(sujo.instrucoes.join(" ")).toMatch(/dois-pontos/);
    expect(sujo.instrucoes.join(" ")).toMatch(/pergunta/);
    for (const i of sujo.instrucoes) expect(i).not.toMatch(/não use/i);
  });
  it("janela vazia", () => {
    const r = resumirEstilo([], BASELINE_PADRAO);
    expect(r.ultimas).toBe(0);
    expect(r.instrucoes).toEqual([]);
  });
});
