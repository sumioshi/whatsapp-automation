import { describe, expect, it } from "vitest";
import type { Contacts } from "../contacts";
import type { MessageView } from "../data";
import { BASELINE_PADRAO } from "./baseline";
import { baselineDoChat, contextoDeEscrita } from "./contexto";

const contatos = { names: new Map(), ownIds: new Set(["5511000000001"]), teamIds: new Set(["5511000000002"]), phones: new Map(), lids: new Set(), hasSidecar: false } as unknown as Contacts;
let seq = 0;
function msg(de: "eu" | "cliente" | "time", text: string, ts: string, extra: Partial<MessageView> = {}): MessageView {
  const sender = de === "eu" ? "5511000000001@s.whatsapp.net" : de === "time" ? "5511000000002@s.whatsapp.net" : "5511000000009@s.whatsapp.net";
  return { id: `m${++seq}`, timestamp: ts, group: "g", groupJid: "g@g.us", sender, senderName: de, fromMe: de === "eu", type: "text", text, quotedText: null, quotedSender: null, mediaPath: null, transcript: null, reactions: [], receipt: null, poll: null, ...extra } as MessageView;
}
const T = (i: number) => new Date(Date.UTC(2026, 8, 14, 12, 0, i)).toISOString();

describe("contextoDeEscrita", () => {
  it("últimas 5 minhas (qualquer origem) e 10 do cliente, na ordem, sem apagadas nem mídia", () => {
    const msgs: MessageView[] = [];
    for (let i = 0; i < 8; i++) msgs.push(msg("eu", `m${i}`, T(i * 3), { origem: i % 2 ? "coletor" : "celular" }));
    for (let i = 0; i < 12; i++) msgs.push(msg("cliente", `c${i}`, T(i * 3 + 1)));
    msgs.push(msg("eu", "apagada", T(100), { deleted: true }));
    msgs.push(msg("eu", "foto", T(101), { type: "image" }));
    msgs.push(msg("time", "time", T(102)));
    const c = contextoDeEscrita(msgs, contatos, new Date(Date.UTC(2026, 8, 14, 12, 5)), BASELINE_PADRAO);
    expect(c.ultimasMinhas).toEqual(["m3", "m4", "m5", "m6", "m7"]);
    expect(c.ultimasDoCliente).toEqual(["c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10", "c11"]);
    expect(c.intervaloDesdeMinhaUltima_s).toBeGreaterThan(0);
    expect(c.baseline).toBe(BASELINE_PADRAO);
  });
  it("sem mensagens minhas: intervalo indefinido", () => {
    const c = contextoDeEscrita([msg("cliente", "oi", T(1))], contatos, new Date(), BASELINE_PADRAO);
    expect(c.ultimasMinhas).toEqual([]);
    expect(c.intervaloDesdeMinhaUltima_s).toBeUndefined();
  });
});

describe("baselineDoChat", () => {
  it("abaixo de 100 elegíveis usa o padrão; acima calcula e cacheia", () => {
    const poucas = Array.from({ length: 50 }, (_, i) => msg("eu", `texto ${i}`, `2026-05-01T00:00:${String(i).padStart(2, "0")}Z`));
    expect(baselineDoChat("chat-a", poucas, BASELINE_PADRAO)).toBe(BASELINE_PADRAO);
    const muitas = Array.from({ length: 120 }, (_, i) => msg("eu", i % 3 ? `Subi o item ${i}` : `pode testar ${i}?`, `2026-05-01T01:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z`));
    const b = baselineDoChat("chat-b", muitas, BASELINE_PADRAO, 1000);
    expect(b.origem).toBe("chat");
    expect(b.n).toBe(120);
    // Cache: mesma referência dentro do TTL mesmo com msgs diferentes
    expect(baselineDoChat("chat-b", poucas, BASELINE_PADRAO, 1000 + 60_000)).toBe(b);
    // Fora do TTL recalcula
    expect(baselineDoChat("chat-b", poucas, BASELINE_PADRAO, 1000 + 3_600_001)).toBe(BASELINE_PADRAO);
  });
  it("mensagens da automação não entram na contagem", () => {
    const auto = Array.from({ length: 150 }, (_, i) => msg("eu", `x ${i}`, `2026-08-01T00:00:00Z`, { origem: "coletor" }));
    expect(baselineDoChat("chat-c", auto, BASELINE_PADRAO)).toBe(BASELINE_PADRAO);
  });
});
