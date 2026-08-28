import { describe, expect, it } from "vitest";
import { tratamentoErrado } from "./voz-guard";

describe("tratamentoErrado", () => {
  it("acusa o pronome de segunda pessoa que o operador não usa", () => {
    expect(tratamentoErrado("me passa teu horário")).toEqual(["teu"]);
    expect(tratamentoErrado("tu viu isso?")).toEqual(["tu"]);
    expect(tratamentoErrado("mando pra ti amanhã")).toEqual(["ti"]);
    expect(tratamentoErrado("falo contigo depois")).toEqual(["contigo"]);
  });

  it("junta todas as ocorrências do balão, sem repetir", () => {
    expect(tratamentoErrado("tu me manda teu email que tu confere")).toEqual(["tu", "teu"]);
  });

  it("não acusa quando o tratamento é o certo", () => {
    expect(tratamentoErrado("me passa seu horário")).toEqual([]);
    expect(tratamentoErrado("vc viu isso?")).toEqual([]);
    expect(tratamentoErrado("mando pra você amanhã")).toEqual([]);
  });

  it("não confunde com palavra que só CONTÉM as letras", () => {
    // o erro caro aqui é o falso positivo: bloquear envio legítimo.
    for (const frase of [
      "a situação tá controlada",
      "isso atua junto com o resto",
      "o tutorial tá pronto",
      "tudo certo por aqui",
      "estatuto da empresa",
      "o time atual",
      "virtude e cetera",
      "vou intuir pelo padrão",
    ]) {
      expect(tratamentoErrado(frase)).toEqual([]);
    }
  });

  it("pega com pontuação, maiúscula e acento colados", () => {
    expect(tratamentoErrado("Tu!")).toEqual(["tu"]);
    expect(tratamentoErrado("(teu)")).toEqual(["teu"]);
    expect(tratamentoErrado("as tuas ideias")).toEqual(["tuas"]);
  });

  it("texto vazio ou sem pronome não acusa nada", () => {
    expect(tratamentoErrado("")).toEqual([]);
    expect(tratamentoErrado("subi a correção, testa aí")).toEqual([]);
  });
});
