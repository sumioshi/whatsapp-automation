import { describe, expect, it } from "vitest";
import { BASELINE_PADRAO } from "./baseline";
import { escolherCandidato } from "./escolher";

const ctx = { ultimasMinhas: [] as string[], ultimasDoCliente: [] as string[], baseline: BASELINE_PADRAO };

describe("escolherCandidato", () => {
  it("escolhe o de menor score entre os que passam", () => {
    const r = escolherCandidato([["Assim: ficou pronto."], ["ficou pronto, pode testar?"], ["ficou pronto!"]], ctx);
    expect(r.indice).toBe(1);
    expect(r.revisao?.ok).toBe(true);
    expect(r.todas).toHaveLength(3);
  });
  it("empate no score decide pelo menor número de hits, depois pelo primeiro", () => {
    const r = escolherCandidato([["subi tudo"], ["subi tudo hoje"]], ctx);
    expect(r.indice).toBe(0);
  });
  it("nenhum passa → índice -1 e todas as revisões", () => {
    const r = escolherCandidato([["tu viu?"], ["foi culpa minha"]], ctx);
    expect(r.indice).toBe(-1);
    expect(r.revisao).toBeNull();
    expect(r.todas.every((t) => !t.ok)).toBe(true);
  });
});
