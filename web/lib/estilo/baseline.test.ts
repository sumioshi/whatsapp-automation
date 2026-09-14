import { describe, expect, it } from "vitest";
import { BASELINE_PADRAO, calcularBaseline, cvTamanho, distinct2, elegivelParaBaseline, temFeature } from "./baseline";

describe("temFeature", () => {
  it("cobre as features que não são tells", () => {
    expect(temFeature("exclamacao", "boa!")).toBe(true);
    expect(temFeature("pergunta", "pode ser hoje?")).toBe(true);
    expect(temFeature("emoji", "fechou 👍")).toBe(true);
    expect(temFeature("maiuscula", "Subi tudo")).toBe(true);
    expect(temFeature("maiuscula", "subi tudo")).toBe(false);
    expect(temFeature("parenteses", "ficou assim (por enquanto)")).toBe(true);
  });
  it("reusa os tells para dois-pontos, travessão, tríade, bullets, negrito", () => {
    expect(temFeature("dois_pontos_intro", "Assim: vai")).toBe(true);
    expect(temFeature("travessao", "a — b")).toBe(true);
  });
});

describe("calcularBaseline", () => {
  const textos = [
    "Opa, subi tudo",
    "boa, pode testar?",
    "Vou olhar isso agora",
    "ficou assim: um e dois",
    "Fechou!",
    "Amanhã cedo eu subo",
  ];
  it("calcula fração por feature e mediana de tamanho", () => {
    const b = calcularBaseline(textos, "chat");
    expect(b.n).toBe(6);
    expect(b.origem).toBe("chat");
    expect(b.p.pergunta).toBeCloseTo(1 / 6, 5);
    expect(b.p.dois_pontos_intro).toBeCloseTo(1 / 6, 5);
    expect(b.p.maiuscula).toBeCloseTo(4 / 6, 5);
    expect(b.tamanhoMediana).toBeGreaterThan(0);
    expect(b.aberturas.opa).toBeCloseTo(1 / 6, 5);
  });
  it("distinct2 e cvTamanho", () => {
    expect(distinct2(["a", "b", "a", "b"])).toBeCloseTo(2 / 3, 5);
    expect(distinct2(["a"])).toBe(0);
    expect(cvTamanho(["um dois", "um dois"])).toBe(0);
    expect(cvTamanho(["um", "um dois três quatro cinco"])).toBeGreaterThan(0.5);
  });
});

describe("BASELINE_PADRAO", () => {
  it("traz as constantes medidas", () => {
    expect(BASELINE_PADRAO.origem).toBe("padrao");
    expect(BASELINE_PADRAO.p.dois_pontos_intro).toBeCloseTo(0.039, 3);
    expect(BASELINE_PADRAO.p.pergunta).toBeCloseTo(0.215, 3);
    expect(BASELINE_PADRAO.p.maiuscula).toBeCloseTo(0.752, 3);
    expect(BASELINE_PADRAO.distinct2p10).toBeCloseTo(0.45, 2);
    expect(BASELINE_PADRAO.cvP10).toBeCloseTo(0.22, 2);
  });
});

describe("elegivelParaBaseline", () => {
  it("aceita fromMe de texto pré-automação ou mandada na mão", () => {
    expect(elegivelParaBaseline({ fromMe: true, type: "text", text: "oi", timestamp: "2026-05-01T00:00:00Z" })).toBe(true);
    expect(elegivelParaBaseline({ fromMe: true, type: "text", text: "oi", timestamp: "2026-08-01T00:00:00Z", origem: "celular" })).toBe(true);
    expect(elegivelParaBaseline({ fromMe: true, type: "text", text: "oi", timestamp: "2026-08-01T00:00:00Z", origem: "web" })).toBe(true);
  });
  it("rejeita automação, pós-junho sem origem, não-texto e recebidas", () => {
    expect(elegivelParaBaseline({ fromMe: true, type: "text", text: "oi", timestamp: "2026-08-01T00:00:00Z", origem: "coletor" })).toBe(false);
    expect(elegivelParaBaseline({ fromMe: true, type: "text", text: "oi", timestamp: "2026-08-01T00:00:00Z" })).toBe(false);
    expect(elegivelParaBaseline({ fromMe: true, type: "image", text: "oi", timestamp: "2026-05-01T00:00:00Z" })).toBe(false);
    expect(elegivelParaBaseline({ fromMe: false, type: "text", text: "oi", timestamp: "2026-05-01T00:00:00Z" })).toBe(false);
  });
});
