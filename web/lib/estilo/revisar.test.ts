import { describe, expect, it } from "vitest";
import { BASELINE_PADRAO } from "./baseline";
import { LIMIAR, revisar } from "./revisar";

const ctx = { ultimasMinhas: [] as string[], ultimasDoCliente: [] as string[], baseline: BASELINE_PADRAO };

describe("revisar — bloqueios", () => {
  it("'tu' e culpa grupo A bloqueiam mesmo sem contexto e mesmo com ignorarScore", () => {
    const tu = revisar({ ...ctx, baloes: ["tu viu isso?"], ignorarScore: true });
    expect(tu.ok).toBe(false);
    expect(tu.bloqueios.map((b) => b.regra)).toContain("tratamento");
    const culpa = revisar({ ...ctx, baloes: ["foi culpa minha, subi de novo"], ignorarScore: true });
    expect(culpa.ok).toBe(false);
    expect(culpa.bloqueios.map((b) => b.regra)).toContain("culpa");
  });
});

describe("revisar — score", () => {
  it("rascunho limpo passa com score 0", () => {
    const r = revisar({ ...ctx, baloes: ["subi o ajuste, pode testar quando puder?"] });
    expect(r.ok).toBe(true);
    expect(r.score).toBe(0);
    expect(r.hits).toEqual([]);
  });
  it("soma tells e culpa; recusa a partir do LIMIAR", () => {
    const r = revisar({ ...ctx, baloes: ["A mais séria: acabei derrubando o total — já voltou."] });
    // dois_pontos_intro (2) + travessao (2) + ponto_final (1) + B acabei (2) + C a mais séria (2)
    expect(r.score).toBeGreaterThanOrEqual(LIMIAR);
    expect(r.ok).toBe(false);
    expect(r.sugestoes.length).toBeGreaterThan(0);
    for (const s of r.sugestoes) expect(s).not.toMatch(/não use/i);
  });
  it("tell e feature do mesmo id não dobram", () => {
    const r = revisar({ ...ctx, baloes: ["Assim: fica"], ultimasMinhas: ["Um: dois", "Três: quatro", "ok", "boa", "vou"] });
    expect(r.hits.filter((h) => h.regra === "dois_pontos_intro")).toHaveLength(1);
  });
  it("minimizadores somam com teto 3", () => {
    const r = revisar({ ...ctx, baloes: ["acho que talvez seja só uma coisinha, vou tentar ver rapidinho"] });
    const d = r.hits.filter((h) => h.regra === "minimizador");
    expect(d.reduce((a, h) => a + h.peso, 0)).toBeLessThanOrEqual(3);
  });
  it("desculpa: uma passa; duas no rascunho, ou uma com outra recente, é peso 3", () => {
    expect(revisar({ ...ctx, baloes: ["desculpa o atraso, subi agora"] }).hits.map((h) => h.regra)).not.toContain("desculpa");
    const duas = revisar({ ...ctx, baloes: ["desculpa, sinto muito"] });
    expect(duas.hits.find((h) => h.regra === "desculpa")?.peso).toBe(3);
    const recente = revisar({ ...ctx, baloes: ["desculpa de novo"], ultimasMinhas: ["desculpa pelo erro"] });
    expect(recente.ok).toBe(false);
  });
  it("ignorarScore pula hits de score mas não bloqueios", () => {
    const r = revisar({ ...ctx, baloes: ["A mais séria: acabei derrubando o total — já voltou."], ignorarScore: true });
    expect(r.ok).toBe(true);
  });
  it("resumo é uma frase", () => {
    const r = revisar({ ...ctx, baloes: ["Assim: fica."] });
    expect(r.resumo).toMatch(/score/);
  });
});

describe("propriedade: janelas humanas variadas passam", () => {
  it("≥ 95% de 200 janelas sintéticas com score < LIMIAR", () => {
    const aberturas = ["subi", "vou ver", "boa", "fechou", "pode testar?", "amanhã sai", "vi aqui", "tá no ar", "consegue olhar?", "ok", "beleza", "fica pra tarde", "o total bate", "não é isso, é o filtro", "valeu"];
    const meio = ["o ajuste do painel", "a conta de hoje", "o filtro de período", "as datas do alerta", "o relatório", "a tela nova", "o deploy", "a regra da comissão"];
    let rnd = 7;
    const r = () => (rnd = (rnd * 48271) % 2147483647) / 2147483647;
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)] as T;
    const frase = () => {
      const k = r();
      if (k < 0.35) return pick(aberturas);
      if (k < 0.7) return `${pick(aberturas)} ${pick(meio)}`;
      return `${pick(aberturas)} ${pick(meio)}, ${pick(aberturas)} ${pick(meio)}`;
    };
    let ok = 0;
    for (let i = 0; i < 200; i++) {
      const ultimas = Array.from({ length: 5 }, frase);
      const rev = revisar({ ...ctx, baloes: [frase()], ultimasMinhas: ultimas });
      if (rev.score < LIMIAR && !rev.hits.some((h) => h.peso >= 3)) ok++;
    }
    expect(ok / 200).toBeGreaterThanOrEqual(0.95);
  });
});
