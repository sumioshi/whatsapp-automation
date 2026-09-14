import { describe, expect, it } from "vitest";
import { contarDesculpas, detectarCulpa } from "./culpa";

const grupos = (t: string) => detectarCulpa(t).map((c) => c.grupo);

describe("grupo A — confissão de culpa (bloqueio)", () => {
  it("casa as formas de confissão", () => {
    for (const t of ["foi culpa minha", "erro meu, já vi", "vacilei nessa", "foi mal, subo agora", "me perdoa pelo atraso"]) {
      expect(grupos(t)).toContain("A");
    }
  });
  it("A tem peso 0 e sugestão positiva", () => {
    const c = detectarCulpa("culpa minha")[0];
    expect(c?.peso).toBe(0);
    expect(c?.sugestao).toMatch(/estado|correção/i);
  });
});

describe("grupo B — acidente/intenção", () => {
  it("casa 'acabei + gerúndio' e variantes", () => {
    expect(grupos("acabei derrubando a despesa")).toContain("B");
    expect(grupos("sem querer apaguei o filtro")).toContain("B");
    expect(grupos("esqueci de subir")).toContain("B");
    expect(detectarCulpa("acabei derrubando")[0]?.peso).toBe(2);
  });
  it("'acabei' sem gerúndio não casa", () => {
    expect(grupos("acabei o ajuste agora")).not.toContain("B");
  });
});

describe("grupo C — drama", () => {
  it("casa dramatização", () => {
    expect(grupos("a mais séria é o total")).toContain("C");
    expect(grupos("isso ia te pegar lá na frente")).toContain("C");
    expect(grupos("por sorte vi antes")).toContain("C");
  });
});

describe("grupo D — minimizadores", () => {
  it("casa hedges e diminutivo de trabalho", () => {
    expect(grupos("acho que agora vai")).toContain("D");
    expect(grupos("um probleminha no filtro")).toContain("D");
    expect(grupos("só uma coisinha")).toContain("D");
    expect(grupos("vou tentar subir hoje")).toContain("D");
  });
  it("'só' fora de pedido e diminutivo afetivo não casam", () => {
    expect(grupos("só isso, subi tudo")).not.toContain("D");
    expect(grupos("mandei um carinho pro time")).not.toContain("D");
  });
});

describe("grupo E — desculpas", () => {
  it("conta ocorrências", () => {
    expect(contarDesculpas("desculpa, sinto muito")).toBe(2);
    expect(contarDesculpas("subi tudo")).toBe(0);
  });
  it("cada ocorrência vira um item E com peso 0", () => {
    const es = detectarCulpa("desculpa pelo atraso, lamento").filter((c) => c.grupo === "E");
    expect(es).toHaveLength(2);
    expect(es[0]?.peso).toBe(0);
  });
});

describe("grupo F — 'não dá' sem alternativa", () => {
  it("casa quando não há alternativa na mesma mensagem", () => {
    expect(grupos("não dá pra fazer hoje")).toContain("F");
  });
  it("não casa quando diz o que dá", () => {
    expect(grupos("não dá hoje, mas amanhã cedo sai")).not.toContain("F");
    expect(grupos("não consigo hoje, o que dá é amanhã")).not.toContain("F");
  });
});
