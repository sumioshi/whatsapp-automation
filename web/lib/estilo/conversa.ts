/**
 * Estado da conversa a partir das mensagens: ativa ou fria, o que o cliente
 * deixou em aberto, se o operador já respondeu na mão. Serve para o agente
 * decidir forma e timing antes de escrever, e para o motor no futuro.
 */
import type { Contacts } from "../contacts";
import { numberFromJid, roleOf } from "../contacts";
import type { MessageView } from "../data";
import { ehPergunta } from "./texto";

export interface EstadoConversa {
  estado: "ativa" | "fria";
  gapDesdeCliente_s: number | null;
  gapDesdeMinha_s: number | null;
  ultimaFoiMinha: boolean;
  latenciaClienteMediana_s: number | null;
  perguntasAbertas: string[];
  operadorRespondeuNaMao: boolean;
  rajadaDoClienteEmAndamento: boolean;
}

export const LIMIAR_ATIVA_S = 13 * 60;
const NA_MAO_S = 30 * 60;
const RAJADA_S = 20;

export function ehDoCliente(m: MessageView, contatos: Contacts): boolean {
  return !m.fromMe && roleOf(contatos, numberFromJid(m.sender)) === "client";
}

const seg = (a: Date, iso: string) => Math.max(0, Math.round((a.getTime() - new Date(iso).getTime()) / 1000));

function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? null) : Math.round(((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2);
}

export function estadoDaConversa(msgs: MessageView[], contatos: Contacts, agora: Date): EstadoConversa {
  const ordem = [...msgs].filter((m) => m.type === "text" && !m.deleted).sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  const minhas = ordem.filter((m) => m.fromMe);
  const doCliente = ordem.filter((m) => ehDoCliente(m, contatos));
  const ultima = ordem[ordem.length - 1];
  const ultimaMinha = minhas[minhas.length - 1];
  const ultimaCliente = doCliente[doCliente.length - 1];

  const perguntasAbertas = doCliente
    .filter((m) => !ultimaMinha || m.timestamp > ultimaMinha.timestamp)
    .map((m) => m.text)
    .filter((t) => ehPergunta(t));

  const lat: number[] = [];
  for (const m of minhas) {
    const prox = doCliente.find((c) => c.timestamp > m.timestamp);
    if (prox) lat.push(Math.round((new Date(prox.timestamp).getTime() - new Date(m.timestamp).getTime()) / 1000));
  }

  return {
    estado: ultima && seg(agora, ultima.timestamp) < LIMIAR_ATIVA_S ? "ativa" : "fria",
    gapDesdeCliente_s: ultimaCliente ? seg(agora, ultimaCliente.timestamp) : null,
    gapDesdeMinha_s: ultimaMinha ? seg(agora, ultimaMinha.timestamp) : null,
    ultimaFoiMinha: Boolean(ultima?.fromMe),
    latenciaClienteMediana_s: mediana(lat.slice(-30)),
    perguntasAbertas,
    operadorRespondeuNaMao: minhas.some((m) => (m.origem === "celular" || m.origem === "web") && seg(agora, m.timestamp) < NA_MAO_S),
    rajadaDoClienteEmAndamento: Boolean(ultimaCliente && ultima === ultimaCliente && seg(agora, ultimaCliente.timestamp) < RAJADA_S),
  };
}
