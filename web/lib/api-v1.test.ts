import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

// O núcleo lê os tokens de DATA_DIR/api-tokens.json na primeira chamada, então
// o diretório precisa existir ANTES do import do módulo.
const DIR = mkdtempSync(join(tmpdir(), "wac-api-"));
const TOKEN_LEITURA = "wac_teste_read";
const TOKEN_ESCRITA = "wac_teste_write";
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

writeFileSync(
  join(DIR, "api-tokens.json"),
  JSON.stringify({
    tokens: [
      { id: "tk_r", nome: "leitura", hash: sha(TOKEN_LEITURA), escopos: ["read"], criadoEm: "" },
      { id: "tk_w", nome: "escrita", hash: sha(TOKEN_ESCRITA), escopos: ["read", "write"], criadoEm: "" },
      { id: "tk_x", nome: "morto", hash: sha("wac_revogado"), escopos: ["read"], criadoEm: "", revogadoEm: "2026-01-01" },
    ],
  }),
);
process.env.WAC_DATA_DIR = DIR;

type Modulo = typeof import("./api-v1");
let api: Modulo;
beforeAll(async () => {
  api = await import("./api-v1");
});

function req(token?: string, extra: Record<string, string> = {}, url = "https://x/api/v1/t") {
  const headers: Record<string, string> = { ...extra };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(url, { method: "POST", headers, body: "{}" });
}

describe("autenticação", () => {
  it("sem token responde 401 com código estável", async () => {
    const h = api.rota("read", async () => api.respostaOk({ ok: true }));
    const res = await h(req());
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
  });

  it("token desconhecido é 401", async () => {
    const h = api.rota("read", async () => api.respostaOk({ ok: true }));
    expect((await h(req("wac_nao_existe"))).status).toBe(401);
  });

  it("token revogado não vale mais", async () => {
    const h = api.rota("read", async () => api.respostaOk({ ok: true }));
    expect((await h(req("wac_revogado"))).status).toBe(401);
  });

  it("token de leitura não escreve (403), token de escrita escreve", async () => {
    const escrita = api.rota("write", async () => api.respostaOk({ ok: true }));
    const negado = await escrita(req(TOKEN_LEITURA));
    expect(negado.status).toBe(403);
    expect((await negado.json()).error.code).toBe("forbidden");
    expect((await escrita(req(TOKEN_ESCRITA))).status).toBe(200);
  });

  it("escopo write também dá leitura", async () => {
    const leitura = api.rota("read", async () => api.respostaOk({ ok: true }));
    expect((await leitura(req(TOKEN_ESCRITA))).status).toBe(200);
  });
});

describe("idempotência de escrita", () => {
  it("mesma chave não executa o handler duas vezes", async () => {
    let execucoes = 0;
    const h = api.rota("write", async () => {
      execucoes += 1;
      return api.respostaOk({ execucoes });
    });
    const chave = { "idempotency-key": "k-1" };
    const primeira = await h(req(TOKEN_ESCRITA, chave));
    const segunda = await h(req(TOKEN_ESCRITA, chave));
    expect(execucoes).toBe(1);
    expect(segunda.headers.get("idempotent-replay")).toBe("true");
    expect((await segunda.json()).data.execucoes).toBe(1);
    expect((await primeira.json()).data.execucoes).toBe(1);
  });

  it("chaves diferentes executam de novo", async () => {
    let execucoes = 0;
    const h = api.rota("write", async () => {
      execucoes += 1;
      return api.respostaOk({ execucoes });
    });
    await h(req(TOKEN_ESCRITA, { "idempotency-key": "k-a" }));
    await h(req(TOKEN_ESCRITA, { "idempotency-key": "k-b" }));
    expect(execucoes).toBe(2);
  });
});

describe("erros e formato", () => {
  it("ErroApi vira o status certo, sem vazar stack", async () => {
    const h = api.rota("read", async () => {
      throw new api.ErroApi("not_found", "chat sumiu");
    });
    const res = await h(req(TOKEN_LEITURA));
    expect(res.status).toBe(404);
    const corpo = await res.json();
    expect(corpo).toEqual({ error: { code: "not_found", message: "chat sumiu" } });
  });

  it("erro inesperado vira 500 internal", async () => {
    const h = api.rota("read", async () => {
      throw new Error("boom");
    });
    const res = await h(req(TOKEN_LEITURA));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
  });

  it("sucesso usa envelope data", async () => {
    const h = api.rota("read", async () => api.respostaOk([1, 2]));
    expect((await (await h(req(TOKEN_LEITURA))).json()).data).toEqual([1, 2]);
  });
});

describe("CORS", () => {
  it("não devolve header para origem fora da allowlist", async () => {
    const h = api.rota("read", async () => api.respostaOk({}));
    const res = await h(req(TOKEN_LEITURA, { origin: "https://intruso.com" }));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("devolve header para origem liberada", async () => {
    process.env.WAC_API_CORS_ORIGINS = "https://amigo.com";
    const h = api.rota("read", async () => api.respostaOk({}));
    const res = await h(req(TOKEN_LEITURA, { origin: "https://amigo.com" }));
    expect(res.headers.get("access-control-allow-origin")).toBe("https://amigo.com");
    delete process.env.WAC_API_CORS_ORIGINS;
  });
});

describe("validação", () => {
  it("slugValido aceita slug real e recusa travessia", () => {
    expect(api.slugValido("acme-projeto-185-ai")).toBe(true);
    expect(api.slugValido("dm-5544900000004")).toBe(true);
    expect(api.slugValido("../../etc/passwd")).toBe(false);
    expect(api.slugValido("com espaço")).toBe(false);
    expect(api.slugValido("")).toBe(false);
  });

  it("hashDeToken é estável e não devolve o token", () => {
    expect(api.hashDeToken("abc")).toBe(api.hashDeToken("abc"));
    expect(api.hashDeToken("abc")).not.toContain("abc");
  });
});
