import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lerCorpus } from "./estilo-baseline";

let dir = "";
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

describe("lerCorpus", () => {
  it("lê o formato [{slug, ts, t}]", async () => {
    dir = await mkdtemp(join(tmpdir(), "corpus-"));
    const p = join(dir, "c.json");
    await writeFile(p, JSON.stringify([{ slug: "a", ts: "2026-05-01T00:00:00Z", t: "subi tudo" }, { slug: "a", ts: "2026-05-01T00:01:00Z", t: "pode testar?" }]));
    expect(await lerCorpus(p)).toEqual(["subi tudo", "pode testar?"]);
  });
  it("lê messages.jsonl aplicando a elegibilidade", async () => {
    dir = await mkdtemp(join(tmpdir(), "corpus-"));
    const p = join(dir, "messages.jsonl");
    const linhas = [
      { fromMe: true, type: "text", text: "minha", timestamp: "2026-05-01T00:00:00Z" },
      { fromMe: true, type: "text", text: "automação", timestamp: "2026-08-01T00:00:00Z", origem: "coletor" },
      { fromMe: false, type: "text", text: "cliente", timestamp: "2026-05-01T00:00:00Z" },
    ];
    await writeFile(p, `${linhas.map((l) => JSON.stringify(l)).join("\n")}\n`);
    expect(await lerCorpus(p)).toEqual(["minha"]);
  });
});
