import { describe, expect, it } from "vitest";
import type { Contacts } from "../contacts";
import type { MessageView } from "../data";
import { estadoDaConversa } from "./conversa";

const contatos: Contacts = {
  names: new Map(),
  ownIds: new Set(["5511000000001"]),
  teamIds: new Set(["5511000000002"]),
  phones: new Map(),
  lids: new Set(),
  hasSidecar: false,
} as unknown as Contacts;

let seq = 0;
function msg(p: Partial<MessageView> & { text: string; ts: string; de: "eu" | "cliente" | "time" }): MessageView {
  const sender = p.de === "eu" ? "5511000000001@s.whatsapp.net" : p.de === "time" ? "5511000000002@s.whatsapp.net" : "5511000000009@s.whatsapp.net";
  return {
    id: `m${++seq}`, timestamp: p.ts, group: "g", groupJid: "g@g.us", sender, senderName: p.de,
    fromMe: p.de === "eu", type: "text", text: p.text, quotedText: null, quotedSender: null, mediaPath: null,
    transcript: null, reactions: [], receipt: null, poll: null, ...(p.origem ? { origem: p.origem } : {}),
  } as MessageView;
}

const T = (min: number) => new Date(Date.UTC(2026, 8, 14, 12, min)).toISOString();
const agora = new Date(Date.UTC(2026, 8, 14, 12, 30));

describe("estadoDaConversa", () => {
  it("ativa quando a última msg tem menos de 13 min; fria depois", () => {
    const ativa = estadoDaConversa([msg({ de: "cliente", text: "oi", ts: T(25) })], contatos, agora);
    expect(ativa.estado).toBe("ativa");
    const fria = estadoDaConversa([msg({ de: "cliente", text: "oi", ts: T(0) })], contatos, agora);
    expect(fria.estado).toBe("fria");
  });
  it("perguntas abertas = do cliente depois da minha última", () => {
    const e = estadoDaConversa([
      msg({ de: "cliente", text: "quando sai?", ts: T(1) }),
      msg({ de: "eu", text: "hoje", ts: T(2) }),
      msg({ de: "cliente", text: "e o filtro?", ts: T(3) }),
      msg({ de: "cliente", text: "dá pra incluir o total", ts: T(4) }),
      msg({ de: "cliente", text: "beleza", ts: T(5) }),
    ], contatos, agora);
    expect(e.perguntasAbertas).toEqual(["e o filtro?", "dá pra incluir o total"]);
    expect(e.ultimaFoiMinha).toBe(false);
  });
  it("operador respondeu na mão nos últimos 30 min; eco do coletor não conta", () => {
    const sim = estadoDaConversa([msg({ de: "eu", text: "vi", ts: T(20), origem: "celular" })], contatos, agora);
    expect(sim.operadorRespondeuNaMao).toBe(true);
    const nao = estadoDaConversa([msg({ de: "eu", text: "vi", ts: T(20), origem: "coletor" })], contatos, agora);
    expect(nao.operadorRespondeuNaMao).toBe(false);
  });
  it("rajada do cliente em andamento (< 20 s)", () => {
    const perto = new Date(agora.getTime() - 10_000).toISOString();
    expect(estadoDaConversa([msg({ de: "cliente", text: "e", ts: perto })], contatos, agora).rajadaDoClienteEmAndamento).toBe(true);
  });
  it("latência mediana do cliente e mensagens do time não contam como cliente", () => {
    const e = estadoDaConversa([
      msg({ de: "eu", text: "a", ts: T(0) }),
      msg({ de: "cliente", text: "b", ts: T(2) }),
      msg({ de: "eu", text: "c", ts: T(3) }),
      msg({ de: "time", text: "x", ts: T(4) }),
      msg({ de: "cliente", text: "d", ts: T(9) }),
    ], contatos, agora);
    expect(e.latenciaClienteMediana_s).toBe(240); // mediana de 120 s e 360 s
    expect(e.perguntasAbertas).toEqual([]);
  });
  it("sem mensagens", () => {
    const e = estadoDaConversa([], contatos, agora);
    expect(e.estado).toBe("fria");
    expect(e.gapDesdeCliente_s).toBeNull();
    expect(e.latenciaClienteMediana_s).toBeNull();
  });
});
