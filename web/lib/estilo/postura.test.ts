import { describe, expect, it } from "vitest";
import { avaliarPostura, type LinhaHistorico, lerVeredito, precisaAvaliar } from "./postura";

const l = (quem: LinhaHistorico["quem"], texto: string): LinhaHistorico => ({ quem, nome: quem === "cliente" ? "Paulo" : quem, hora: "15/10 15:00", texto });

const respostaOpenRouter = (conteudo: unknown) =>
  (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(conteudo) } }] }), { status: 200 })) as unknown as typeof fetch;

describe("precisaAvaliar", () => {
  it("avalia quando o cliente falou depois da minha última", () => {
    expect(precisaAvaliar([l("eu", "subiu"), l("cliente", "ENTENDEU sobre as trilhas ?")])).toBe(true);
  });
  it("pula follow-up meu sem concessão nem conserto", () => {
    expect(precisaAvaliar([l("cliente", "ok"), l("eu", "fechado")], ["te mando a prévia amanhã cedo"])).toBe(false);
  });
  it("avalia rascunho que anuncia conserto mesmo sem fala nova do cliente", () => {
    expect(precisaAvaliar([l("cliente", "erro na legenda"), l("eu", "vi aqui")], ["legenda arrumada, já tá no ar"])).toBe(true);
  });
});

describe("lerVeredito", () => {
  it("com rascunho, falha vira hit grave com a sugestão do modelo", () => {
    const r = lerVeredito(
      { entendimento: { falhou: true, trecho: "Essas são NOSSAS exclusivas", sugestao: "exclusivas só no seu número, certo?" }, concordancia: { falhou: false }, conserto: { falhou: false } },
      true,
    );
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]).toMatchObject({ regra: "entendimento", peso: 4, sugestao: "exclusivas só no seu número, certo?" });
    expect(r.alertas).toEqual([]);
  });
  it("sem rascunho, risco vira alerta e nunca hit", () => {
    const r = lerVeredito({ conserto: { risco: true, trecho: "legenda, 4ª vez", sugestao: "mostra o vídeo refeito" } }, false);
    expect(r.hits).toEqual([]);
    expect(r.alertas[0]).toContain("conserto: mostra o vídeo refeito");
  });
  it("sugestão vazia cai no texto padrão e lixo não quebra", () => {
    expect(lerVeredito({ concordancia: { falhou: true, sugestao: "" } }, true).hits[0]?.sugestao).toMatch(/custo ou o impacto/);
    expect(lerVeredito("lixo", true)).toEqual({ hits: [], alertas: [] });
  });
});

describe("avaliarPostura", () => {
  const historico = [l("eu", "subi as 5 no editor"), l("cliente", "ENTENDEU sobre as trilhas ?")];

  it("devolve os hits do modelo", async () => {
    const r = await avaliarPostura({
      historico,
      baloes: ["entendi sim, já tirei"],
      chave: "x",
      fetchFn: respostaOpenRouter({ entendimento: { falhou: true, trecho: "ENTENDEU", sugestao: "diz o que entendeu" } }),
    });
    expect(r.avaliado).toBe(true);
    expect(r.hits.map((h) => h.regra)).toEqual(["entendimento"]);
  });
  it("falha da OpenRouter não segura o envio", async () => {
    const r = await avaliarPostura({ historico, baloes: ["entendi sim"], chave: "x", fetchFn: (async () => new Response("sem saldo", { status: 402 })) as unknown as typeof fetch });
    expect(r).toMatchObject({ hits: [], avaliado: false });
    expect(r.erro).toContain("402");
  });
  it("sem chave não chama nada", async () => {
    const antes = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const r = await avaliarPostura({ historico, baloes: ["entendi sim"], chave: "" });
    if (antes !== undefined) process.env.OPENROUTER_API_KEY = antes;
    expect(r.avaliado).toBe(false);
  });
});
