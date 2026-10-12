import { describe, expect, it } from "vitest";
import { skillDeVoz } from "./skill-voz";

describe("skillDeVoz", () => {
  it("sem WAC_SKILL_VOZ aponta para o molde do projeto", () => {
    expect(skillDeVoz({})).toEqual({ nome: "voz-do-operador", preenchida: false });
  });

  it("com WAC_SKILL_VOZ aponta para a skill preenchida pelo nome", () => {
    expect(skillDeVoz({ WAC_SKILL_VOZ: "voz-do-dono" })).toEqual({ nome: "voz-do-dono", preenchida: true });
  });

  it("valor só com espaços conta como vazio", () => {
    expect(skillDeVoz({ WAC_SKILL_VOZ: "   " })).toEqual({ nome: "voz-do-operador", preenchida: false });
  });

  it("apara espaços em volta do nome", () => {
    expect(skillDeVoz({ WAC_SKILL_VOZ: " voz-do-dono \n" }).nome).toBe("voz-do-dono");
  });
});
