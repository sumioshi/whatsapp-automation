import { describe, expect, it } from "vitest";
import { BASELINE_PADRAO } from "./baseline";
import { detectarCulpa } from "./culpa";
import { bloqueiosDe, LIMIAR, revisar } from "./revisar";

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

  it("balão idêntico a uma mensagem minha recente bloqueia, mesmo com ignorarScore, e diz qual", () => {
    const r = revisar({ ...ctx, minhasRecentes: ["Bom dia irmão", "vi o vídeo"], baloes: ["bom dia irmão!", "novidade"], ignorarScore: true });
    expect(r.ok).toBe(false);
    expect(r.bloqueios.map((b) => b.regra)).toEqual(["repetido"]);
    expect(r.bloqueios[0]?.motivo).toContain("bom dia irmão");
    // só os últimos 30 min contam: o mesmo texto fora de `minhasRecentes` passa
    const antigo = revisar({ ...ctx, ultimasMinhas: ["bom dia irmão"], baloes: ["bom dia irmão"] });
    expect(antigo.bloqueios).toEqual([]);
  });

  it("o nome do operador sem artigo bloqueia mesmo com ignorarScore, e a sugestão ensina a vírgula do chamamento", () => {
    const r = revisar({ ...ctx, nomeOperador: "Fulano Souza", baloes: ["Fulano vai ver isso amanhã"], ignorarScore: true });
    expect(r.ok).toBe(false);
    expect(r.bloqueios.map((b) => b.regra)).toEqual(["revela_ia"]);
    expect(r.bloqueios[0]?.sugestao).toMatch(/vírgula/);
    expect(revisar({ ...ctx, nomeOperador: "Fulano Souza", baloes: ["Fulano, vai ver isso amanhã?"] }).bloqueios).toEqual([]);
  });
});

describe("revisar — saudação do horário", () => {
  it("saudação fora do horário de Brasília recusa e diz qual cabe; com ignorarScore passa", () => {
    const tarde = new Date("2026-10-13T15:00:00-03:00");
    const r = revisar({ ...ctx, agora: tarde, baloes: ["Bom dia! subiu a correção"] });
    expect(r.ok).toBe(false);
    expect(r.hits.map((h) => h.regra)).toContain("saudacao_horario");
    expect(r.sugestoes.join(" ")).toMatch(/boa tarde/);
    expect(revisar({ ...ctx, agora: tarde, baloes: ["Bom dia! subiu a correção"], ignorarScore: true }).ok).toBe(true);
  });

  it("sem `agora` (edição de mensagem antiga) não confere o horário", () => {
    const r = revisar({ ...ctx, baloes: ["Bom dia! subiu a correção"] });
    expect(r.hits.map((h) => h.regra)).not.toContain("saudacao_horario");
    const manha = revisar({ ...ctx, agora: new Date("2026-10-13T09:00:00-03:00"), baloes: ["Bom dia! subiu a correção"] });
    expect(manha.hits.map((h) => h.regra)).not.toContain("saudacao_horario");
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
    const aberturas = ["subi", "vou ver", "boa", "fechou", "pode testar?", "amanhã sai", "vi aqui", "tá no ar", "consegue olhar?", "ok", "beleza", "fica pra tarde", "o total bate", "não é isso, é o filtro", "valeu", "deixa comigo", "já olho", "tô vendo", "ficou pronto", "me manda o print?", "qual conta?", "hoje não dá, amanhã cedo", "rodou certo", "faltou o campo", "vou subir agora", "bateu aqui", "testa de novo", "era cache", "chegou", "sim"];
    const meio = ["o ajuste do painel", "a conta de hoje", "o filtro de período", "as datas do alerta", "o relatório", "a tela nova", "o deploy", "a regra da comissão", "o cadastro", "a exportação", "o login", "a soma do mês", "o gráfico", "a notificação", "o backup", "a planilha", "o boleto", "o cupom", "a fila", "o webhook"];
    const quando = ["amanhã", "hoje", "à tarde", "depois do almoço", "na segunda", "mais tarde"];
    let rnd = 7;
    const r = () => (rnd = (rnd * 48271) % 2147483647) / 2147483647;
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)] as T;
    const frase = () => {
      const k = r();
      if (k < 0.3) return pick(aberturas);
      if (k < 0.6) return `${pick(aberturas)} ${pick(meio)}`;
      if (k < 0.8) return `${pick(aberturas)}, ${pick(meio)} ${pick(quando)}`;
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

describe('bloqueiosDe com a detecção de culpa já feita', () => {
  it('usa a lista recebida em vez de detectar de novo', () => {
    expect(bloqueiosDe(['foi culpa minha, desculpa']).map((b) => b.regra)).toContain('culpa');
    expect(bloqueiosDe(['foi culpa minha, desculpa'], [], []).map((b) => b.regra)).not.toContain('culpa');
  });
  it('sem a lista, o resultado é o mesmo de passar a detecção do texto', () => {
    const baloes = ['foi culpa minha', 'tu viu?'];
    expect(bloqueiosDe(baloes, [])).toEqual(bloqueiosDe(baloes, [], detectarCulpa(baloes.join('\n'))));
  });
});
