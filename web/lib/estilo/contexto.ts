/**
 * Ponte entre as mensagens do chat e os módulos puros do guard: separa as
 * últimas mensagens da conta e do cliente, calcula o estado e resolve o
 * baseline (do próprio chat quando ele tem histórico do operador suficiente).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Contacts } from "../contacts";
import type { MessageView } from "../data";
import type { Baseline } from "./baseline";
import { BASELINE_PADRAO, calcularBaseline, elegivelParaBaseline } from "./baseline";
import type { EstadoConversa } from "./conversa";
import { ehDoCliente, estadoDaConversa } from "./conversa";

export interface ContextoEscrita {
  ultimasMinhas: string[];
  /** Tudo que a conta mandou nos últimos 30 min: balão igual a um destes não sai de novo. */
  minhasRecentes: string[];
  ultimasDoCliente: string[];
  estado: EstadoConversa;
  intervaloDesdeMinhaUltima_s?: number;
  baseline: Baseline;
}

export const MIN_MSGS_BASELINE = 100;
export const JANELA_RECENTES_MS = 30 * 60 * 1000;
const N_MINHAS = 5;
const N_CLIENTE = 10;
const TTL_MS = 60 * 60 * 1000;

function textos(msgs: MessageView[]): MessageView[] {
  return [...msgs].filter((m) => m.type === "text" && m.text?.trim() && !m.deleted).sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
}

export function contextoDeEscrita(msgs: MessageView[], contatos: Contacts, agora: Date, baseline: Baseline): ContextoEscrita {
  const ordem = textos(msgs);
  const minhas = ordem.filter((m) => m.fromMe);
  const cliente = ordem.filter((m) => ehDoCliente(m, contatos));
  const ultimaMinha = minhas[minhas.length - 1];
  const limiteRecentes = agora.getTime() - JANELA_RECENTES_MS;
  return {
    ultimasMinhas: minhas.slice(-N_MINHAS).map((m) => m.text),
    minhasRecentes: minhas.filter((m) => new Date(m.timestamp).getTime() >= limiteRecentes).map((m) => m.text),
    ultimasDoCliente: cliente.slice(-N_CLIENTE).map((m) => m.text),
    estado: estadoDaConversa(msgs, contatos, agora),
    ...(ultimaMinha ? { intervaloDesdeMinhaUltima_s: Math.max(0, Math.round((agora.getTime() - new Date(ultimaMinha.timestamp).getTime()) / 1000)) } : {}),
    baseline,
  };
}

const cache = new Map<string, { em: number; baseline: Baseline }>();

export function baselineDoChat(slug: string, msgs: MessageView[], padrao: Baseline, agora: number = Date.now()): Baseline {
  const hit = cache.get(slug);
  if (hit && agora - hit.em < TTL_MS) return hit.baseline;
  const elegiveis = msgs.filter((m) => elegivelParaBaseline(m)).map((m) => m.text);
  const baseline = elegiveis.length >= MIN_MSGS_BASELINE ? calcularBaseline(elegiveis, "chat") : padrao;
  cache.set(slug, { em: agora, baseline });
  return baseline;
}

export async function carregarBaselinePadrao(dataDir: string): Promise<Baseline> {
  try {
    const raw = JSON.parse(await readFile(join(dataDir, ".estilo-baseline.json"), "utf8")) as Partial<Baseline>;
    if (raw && typeof raw.n === "number" && raw.p && typeof raw.p.dois_pontos_intro === "number") return { ...BASELINE_PADRAO, ...raw, origem: "padrao" };
  } catch {
    /* sem arquivo: constantes medidas */
  }
  return BASELINE_PADRAO;
}
