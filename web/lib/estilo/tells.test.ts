import { describe, expect, it } from "vitest";
import { detectarTells, temTell } from "./tells";

const ids = (t: string) => detectarTells(t).map((x) => x.id);

describe("dois_pontos_intro", () => {
  it("casa dois-pontos que introduz frase ou quebra", () => {
    expect(ids("A mais séria: o total sumiu")).toContain("dois_pontos_intro");
    expect(ids("Ficou assim:\nlista")).toContain("dois_pontos_intro");
  });
  it("não casa hora, URL nem rótulo técnico de uma palavra", () => {
    expect(ids("às 10:30 eu subo")).not.toContain("dois_pontos_intro");
    expect(ids("veja https://exemplo.com/x")).not.toContain("dois_pontos_intro");
    expect(ids("ex: painel de vendas")).not.toContain("dois_pontos_intro");
    expect(ids("obs: fica pra amanhã")).not.toContain("dois_pontos_intro");
  });
});

describe("pontuação e estrutura", () => {
  it("travessão e hífen espaçado", () => {
    expect(ids("subi tudo — pode testar")).toContain("travessao");
    expect(ids("subi tudo - pode testar")).toContain("travessao");
    expect(ids("e-mail já foi")).not.toContain("travessao");
  });
  it("tríade curta e 'não só X mas Y'", () => {
    expect(ids("ficou rápido, leve e limpo")).toContain("triade");
    expect(ids("não só corrige o total mas também alinha a coluna")).toContain("nao_so_mas");
    expect(ids("não é só o painel, é o banco")).toContain("nao_e_x_e_y");
  });
  it("ponto final no fim do balão", () => {
    expect(ids("subi tudo.")).toContain("ponto_final");
    expect(ids("subi tudo. pode testar")).not.toContain("ponto_final");
  });
  it("markdown, bullets, negrito, emoji como marcador", () => {
    expect(ids("**importante** ver isso")).toContain("markdown");
    expect(ids("- item um\n- item dois")).toContain("bullets");
    expect(ids("ficou *pronto* hoje")).toContain("negrito");
    expect(ids("✅ subi tudo")).toContain("emoji_marcador");
    expect(ids("subi tudo 👍")).not.toContain("emoji_marcador");
  });
});

describe("léxico", () => {
  it("validação na abertura e fechamento reflexo", () => {
    expect(ids("Ótimo ponto, vou ver")).toContain("validacao_abertura");
    expect(ids("qualquer coisa me chama")).toContain("fechamento_reflexo");
    expect(ids("fico à disposição")).toContain("fechamento_reflexo");
  });
  it("vocabulário de IA e gerúndio de profundidade", () => {
    expect(ids("é crucial otimizar a jornada")).toContain("vocabulario_ia");
    expect(ids("subi o fix, garantindo que o total bata")).toContain("gerundio_profundidade");
    expect(ids("subi o fix e o total bate")).not.toContain("vocabulario_ia");
  });
  it("cada id aparece no máximo uma vez, com sugestão positiva", () => {
    const tells = detectarTells("Ponto A: um. Ponto B: dois.");
    expect(tells.filter((t) => t.id === "dois_pontos_intro")).toHaveLength(1);
    for (const t of tells) expect(t.sugestao).not.toMatch(/não use/i);
  });
  it("temTell responde por id", () => {
    expect(temTell("triade", "a, b e c")).toBe(true);
    expect(temTell("triade", "a e b")).toBe(false);
  });
});
