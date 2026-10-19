/**
 * Postura diante do cliente: o que regex não pega porque depende do histórico.
 * Um modelo barato lê a conversa e o rascunho e responde três perguntas:
 *
 * - entendimento: o cliente disse algo ambíguo ou cobrou "entendeu?" e o
 *   rascunho age ou confirma sem dizer o que entendeu;
 * - concordância: o rascunho só concede a uma ideia nova do cliente, sem
 *   custo, impacto nem pergunta;
 * - conserto: o rascunho dá como resolvido um problema que já foi dado como
 *   resolvido antes no chat e voltou, sem prova;
 * - cobrança: o cliente cobra ou acusa e o rascunho concede o que o histórico
 *   desmente, só se desculpa sem fato, não se posiciona, ou fala do
 *   comportamento dele em vez do fato e do processo.
 *
 * Sem rascunho (preparar_resposta), devolve o que a próxima resposta precisa
 * fazer. Falha da chamada nunca segura o envio: volta sem hits e com `erro`.
 */
import type { Contacts } from "../contacts";
import { numberFromJid, roleOf } from "../contacts";
import type { MessageView } from "../data";
import type { Hit } from "./repeticao";

export type RegraPostura = "entendimento" | "concordancia" | "conserto" | "cobranca";

export interface LinhaHistorico {
  quem: "eu" | "cliente" | "equipe";
  nome: string;
  hora: string;
  texto: string;
}

export interface ResultadoPostura {
  hits: Hit[];
  /** Sem rascunho: o que a próxima resposta precisa fazer. */
  alertas: string[];
  avaliado: boolean;
  erro?: string;
}

export interface OpcoesPostura {
  historico: LinhaHistorico[];
  baloes?: string[];
  chave?: string;
  modelo?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MODELO_PADRAO = "google/gemini-3.8-flash";
const N_HISTORICO = 60;
const PESO = 4;

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function conteudo(m: MessageView): string {
  const partes: string[] = [];
  if (m.type !== "text") partes.push(`[${m.type}]`);
  if (m.text?.trim()) partes.push(m.text.trim());
  if (m.transcript?.trim()) partes.push(`(fala: ${m.transcript.trim()})`);
  if (m.quotedText?.trim()) partes.unshift(`(respondendo a "${m.quotedText.trim().slice(0, 120)}")`);
  return partes.join(" ");
}

export function historicoDaConversa(msgs: MessageView[], contatos: Contacts, n = N_HISTORICO): LinhaHistorico[] {
  return [...msgs]
    .filter((m) => !m.deleted && m.type !== "call")
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
    .slice(-n)
    .map((m) => {
      const papel = m.fromMe ? "eu" : roleOf(contatos, numberFromJid(m.sender)) === "client" ? "cliente" : "equipe";
      return { quem: papel, nome: m.fromMe ? "eu" : m.senderName || "?", hora: hora(m.timestamp), texto: conteudo(m) } as LinhaHistorico;
    })
    .filter((l) => l.texto);
}

const ANUNCIA_CONSERTO = /corrigid|corrigi\b|arrumad|arrumei|já tá no ar|ta no ar|tá no ar|subiu|resolvid|funcionando|refi[zt]/i;
const CONCEDE = /\b(concordo|faz sentido|tem razão|boa ideia|gostei da ideia|isso mesmo|exato|entendi sim|perfeito|verdade|passou sim|desculp\p{L}*|foi mal)(?![\p{L}])/iu;

/**
 * Só gasta chamada quando há o que julgar: fala do cliente ainda sem resposta,
 * ou rascunho que concede ou anuncia conserto.
 */
export function precisaAvaliar(historico: LinhaHistorico[], baloes?: string[]): boolean {
  const ultimaMinha = historico.map((l) => l.quem).lastIndexOf("eu");
  const clienteDepois = historico.slice(ultimaMinha + 1).some((l) => l.quem === "cliente");
  if (clienteDepois) return true;
  const texto = (baloes ?? []).join("\n");
  return ANUNCIA_CONSERTO.test(texto) || CONCEDE.test(texto);
}

const INSTRUCOES = `Você audita a postura de quem atende um cliente no WhatsApp (o "eu" do histórico é o prestador de serviço).
O risco que você procura: o prestador sair como bobo por dar razão automaticamente, fingir que entendeu, ou anunciar conserto que não se sustenta.

Avalie QUATRO coisas. Marque "falhou": true SÓ com evidência concreta no histórico. Na dúvida, false. Conversa normal, pedido claro e resposta objetiva são false.

1. entendimento: a fala mais recente do cliente tem um termo ambíguo que muda o que será feito (ex.: "exclusivas" pode ser "só pra mim" ou "feitas por nós"), contradiz algo combinado antes, ou cobra se entendemos ("entendeu?", caixa alta repetindo o pedido, "não foi isso"). Falha quando o rascunho age ou diz que entendeu sem dizer, numa frase, O QUE entendeu, ou sem perguntar o ponto ambíguo.
2. concordancia: o cliente propõe ideia, mudança ou funcionalidade nova. Falha quando o rascunho só concede ("concordo", "faz sentido", "boa", "vou fazer") sem dizer custo, prazo, o que atrasa, se está no escopo, ou sem uma pergunta que qualifique. Concordar com fato verificado, ou com correção de algo que é bug nosso, NÃO é falha.
3. conserto: o rascunho diz que algo foi corrigido, está no ar ou funcionando, e o histórico mostra que ESSE MESMO problema já foi dado como resolvido antes e o cliente reclamou de novo. Falha quando o rascunho não traz prova (o resultado refeito, o teste rodado, o caso exato que passou) nem diz o que ainda falta.

4. cobranca: o cliente cobra ou acusa ("te passei isso ontem", "já mandei esse bug e continua", "nada funciona", "vocês são amadores", "vamos ter que tirar?"). Confira no histórico o que é verdade. Falha quando o rascunho:
   - concede o que o histórico desmente ou não confirma ("verdade", "passou sim" quando não passou, aceita "nada funciona");
   - só se desculpa ou promete, sem o fato (data, hora, o que chegou, o que já funciona) e sem próximo passo;
   - não se posiciona na primeira frase (fica explicando, validando sentimento, "entendo sua frustração");
   - fala do comportamento do cliente ("não ajuda marcar todo mundo", "não precisa mandar no grupo"), em vez do fato e do processo ("o que me faz fechar mais rápido é o caso exato").
   Assumir uma vez, em voz de fato, o que é verdade ("passou sim, ficou pra trás aqui") NÃO é falha. Na sugestao, traga a primeira frase de posição e o fato do histórico. Data, hora e número só se aparecerem LITERALMENTE no histórico acima; sem isso, descreva o fato sem hora. Um fato inventado é pior que nenhum.

Sem rascunho: diga, para cada item em que a próxima resposta corre esse risco, o que ela precisa fazer ("risco": true).

Responda SÓ JSON:
{"entendimento":{"falhou":bool,"trecho":"fala do cliente","sugestao":"a pergunta ou a frase de checagem a usar"},
 "concordancia":{"falhou":bool,"trecho":"a ideia","sugestao":"o custo/impacto a dizer ou a pergunta a fazer"},
 "conserto":{"falhou":bool,"trecho":"o problema e quantas vezes já foi dado como resolvido","sugestao":"a prova a mostrar ou o que dizer que falta"},
 "cobranca":{"falhou":bool,"trecho":"a cobrança e o que o histórico mostra","sugestao":"a frase de posição e o fato com data/hora"}}
Sem rascunho, use "risco" no lugar de "falhou".`;

export function montarPedido(historico: LinhaHistorico[], baloes: string[] | undefined, modelo: string) {
  const conversa = historico.map((l) => `[${l.hora}] ${l.quem === "eu" ? "EU" : l.quem === "cliente" ? `CLIENTE (${l.nome})` : `EQUIPE (${l.nome})`}: ${l.texto}`).join("\n");
  const rascunho = baloes?.length ? `\n\nRASCUNHO DA PRÓXIMA RESPOSTA (ainda não enviado):\n${baloes.join("\n")}` : "\n\nSEM RASCUNHO: avalie o risco da próxima resposta.";
  return {
    model: modelo,
    temperature: 0,
    response_format: { type: "json_object" },
    provider: { sort: "latency" },
    messages: [
      { role: "system", content: INSTRUCOES },
      { role: "user", content: `HISTÓRICO (mais antigo primeiro):\n${conversa}${rascunho}` },
    ],
  };
}

const MOTIVO: Record<RegraPostura, string> = {
  entendimento: "age ou confirma sem dizer o que entendeu",
  concordancia: "só concede à ideia do cliente",
  conserto: "anuncia de novo como resolvido um problema que já voltou",
  cobranca: "não se posiciona diante da cobrança",
};

const PADRAO: Record<RegraPostura, string> = {
  entendimento: "diz em uma frase o que entendeu e pergunta o ponto ambíguo antes de agir",
  concordancia: "diz o custo ou o impacto da ideia (prazo, escopo, o que atrasa) ou faz uma pergunta que qualifique",
  conserto: "mostra a prova (o resultado refeito, o caso que passou) ou diz o que ainda falta",
  cobranca: "abre se posicionando (o que é verdade e o que não é), traz o fato com data e hora e fecha no próximo passo",
};

interface Item {
  falhou?: unknown;
  risco?: unknown;
  trecho?: unknown;
  sugestao?: unknown;
}

export function lerVeredito(json: unknown, comRascunho: boolean): { hits: Hit[]; alertas: string[] } {
  const hits: Hit[] = [];
  const alertas: string[] = [];
  const obj = (json && typeof json === "object" ? json : {}) as Record<string, Item | undefined>;
  for (const regra of ["entendimento", "concordancia", "conserto", "cobranca"] as RegraPostura[]) {
    const item = obj[regra];
    if (!item) continue;
    const trecho = typeof item.trecho === "string" ? item.trecho.trim().slice(0, 200) : "";
    const sugestao = typeof item.sugestao === "string" && item.sugestao.trim() ? item.sugestao.trim() : PADRAO[regra];
    if (comRascunho && item.falhou === true) {
      hits.push({ regra, peso: PESO, motivo: `${MOTIVO[regra]}${trecho ? ` ("${trecho}")` : ""}`, sugestao });
    } else if (!comRascunho && (item.risco === true || item.falhou === true)) {
      alertas.push(`${regra}: ${sugestao}${trecho ? ` (${trecho})` : ""}`);
    }
  }
  return { hits, alertas };
}

export async function avaliarPostura(o: OpcoesPostura): Promise<ResultadoPostura> {
  const vazio = { hits: [], alertas: [] };
  const baloes = o.baloes?.map((b) => b.trim()).filter(Boolean);
  if (!o.historico.length || !precisaAvaliar(o.historico, baloes)) return { ...vazio, avaliado: false };
  const chave = (o.chave ?? process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!chave) return { ...vazio, avaliado: false, erro: "OPENROUTER_API_KEY ausente: postura não avaliada" };
  const modelo = o.modelo ?? process.env.WAC_POSTURA_MODEL ?? MODELO_PADRAO;
  try {
    const res = await (o.fetchFn ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json", "X-Title": "whatsapp-collector postura" },
      body: JSON.stringify(montarPedido(o.historico, baloes, modelo)),
      signal: AbortSignal.timeout(o.timeoutMs ?? 40_000),
    });
    const corpo = await res.text();
    if (!res.ok) return { ...vazio, avaliado: false, erro: `OpenRouter HTTP ${res.status}: ${corpo.slice(0, 160)}` };
    const conteudo = JSON.parse(corpo)?.choices?.[0]?.message?.content ?? "";
    const json = JSON.parse(String(conteudo).replace(/^```(?:json)?\s*|\s*```$/g, ""));
    return { ...lerVeredito(json, Boolean(baloes?.length)), avaliado: true };
  } catch (err) {
    return { ...vazio, avaliado: false, erro: `postura não avaliada: ${err instanceof Error ? err.message : String(err)}` };
  }
}
