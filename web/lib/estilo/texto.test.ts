import { describe, expect, it } from "vitest";
import { ehPergunta, frases, palavrasDeConteudo, primeiraPalavra, radical, tokenizar } from "./texto";

describe("tokenizar", () => {
  it("minúsculas e acento preservado", () => {
    expect(tokenizar("Opa, já Ajustei o Módulo!")).toEqual(["opa", "já", "ajustei", "o", "módulo"]);
  });
  it("vazio dá lista vazia", () => {
    expect(tokenizar("   ")).toEqual([]);
  });
});

describe("radical", () => {
  it("junta formas do mesmo verbo", () => {
    expect(radical("ajustei")).toBe(radical("ajustar"));
    expect(radical("ajustado")).toBe(radical("ajustando"));
  });
  it("não encolhe palavra curta abaixo de 3 letras", () => {
    expect(radical("dás")).toBe("dás");
    expect(radical("sim")).toBe("sim");
  });
});

describe("primeiraPalavra", () => {
  it("ignora pontuação e emoji no início", () => {
    expect(primeiraPalavra("👍 Opa, tudo bem")).toBe("opa");
    expect(primeiraPalavra("")).toBe("");
  });
});

describe("frases", () => {
  it("corta em ponto/interrogação/exclamação seguidos de espaço", () => {
    expect(frases("Subi tudo. Pode testar? Beleza!")).toEqual(["Subi tudo.", "Pode testar?", "Beleza!"]);
  });
  it("não corta versão nem decimal", () => {
    expect(frases("Versão 2.1.0 saiu com 3.75 de nota")).toEqual(["Versão 2.1.0 saiu com 3.75 de nota"]);
  });
});

describe("ehPergunta", () => {
  it("termina em ? ou começa com interrogativo", () => {
    expect(ehPergunta("pode ser hoje?")).toBe(true);
    expect(ehPergunta("Quando vc consegue olhar")).toBe(true);
    expect(ehPergunta("dá pra subir amanhã")).toBe(true);
    expect(ehPergunta("subi tudo")).toBe(false);
  });
});

describe("palavrasDeConteudo", () => {
  it("tira stopwords e curtas, radicaliza e deduplica", () => {
    expect(palavrasDeConteudo("Eu ajustei o painel e ajustei a conta")).toEqual([radical("ajustei"), radical("painel"), radical("conta")]);
  });
});
