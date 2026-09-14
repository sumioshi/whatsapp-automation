import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registrarRevisao } from "./registro";

let dir = "";
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

describe("registrarRevisao", () => {
  it("faz append de uma linha JSON por chamada", async () => {
    dir = await mkdtemp(join(tmpdir(), "rev-"));
    const linha = { ts: "2026-09-14T12:00:00Z", slug: "chat-x", tool: "responder", score: 2, hits: ["ponto_final"], bloqueios: [], enviado: true };
    await registrarRevisao(dir, linha);
    await registrarRevisao(dir, { ...linha, score: 5, enviado: false });
    const conteudo = await readFile(join(dir, ".revisoes.jsonl"), "utf8");
    const linhas = conteudo.trim().split("\n").map((l) => JSON.parse(l));
    expect(linhas).toHaveLength(2);
    expect(linhas[1].score).toBe(5);
  });
  it("nunca lança, mesmo com diretório inválido", async () => {
    await expect(registrarRevisao("/dev/null/nao-existe", { ts: "x", slug: "s", tool: "t", score: 0, hits: [], bloqueios: [], enviado: false })).resolves.toBeUndefined();
  });
});
