import { buildContacts } from "./contacts";
import { type CompactMsg, compact } from "./context";
import { readGroupMessages } from "./data";
import { readBoundMemory, readGroupMemory } from "./memory";
import { readTriage } from "./triage";

// Este módulo é MODEL-AGNOSTIC de propósito: monta contexto + prompt num shape neutro
// (NeutralPrompt). A escolha de provedor (OpenRouter/Anthropic/local) e o streaming
// vivem em lib/llm.ts. Trocar de modelo não toca aqui.

/** Teto de mensagens recentes injetadas no contexto (corte de token). */
export const COPILOT_CONTEXT_LIMIT = 60;

/** Teto de tokens de saída — resumo e rascunho são curtos. */
export const COPILOT_MAX_TOKENS = 2048;

export type CopilotAction = "resumir" | "rascunhar" | "sugerir" | "followup";

/** Mensagem de chat trocada com o copiloto (histórico da sessão atual, vindo do cliente). */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** O copiloto está ligado neste grupo? (opt-in por grupo no `.triage.json`). */
export async function isCopilotEnabled(slug: string): Promise<boolean> {
  const { copilot } = await readTriage();
  return copilot[slug] === true;
}

export interface GroupContext {
  /** Memória curada deste cliente (editável no painel). Específica, tem prioridade. */
  groupMemory: string;
  /** Memória do Claude Code (compartilhada entre grupos, mantida nas sessões). */
  sharedMemory: string;
  messages: CompactMsg[];
}

/**
 * Monta o contexto do grupo pro prompt: as duas camadas de memória (compartilhada do
 * Claude Code + curada do grupo) + últimas N mensagens (desde o `lastSeen` se for mais
 * recente e couber em N), compactadas via `compact()`. Só texto + transcrições já
 * feitas — sem mídia, sem transcrever pendentes (custo/token).
 */
export async function buildContext(slug: string): Promise<GroupContext> {
  let msgs = await readGroupMessages(slug);
  const triage = await readTriage();
  const since = triage.lastSeen[slug];
  // Corta por lastSeen só quando isso reduz o conjunto (mantém o teto de N como limite duro).
  if (since) {
    const recent = msgs.filter((m) => m.timestamp >= since);
    if (recent.length && recent.length <= COPILOT_CONTEXT_LIMIT) msgs = recent;
  }
  msgs = msgs.slice(-COPILOT_CONTEXT_LIMIT);

  const boundDirs = triage.memorySources[slug] ?? [];
  const [c, groupMemory, sharedMemory] = await Promise.all([
    buildContacts(),
    readGroupMemory(slug),
    // Se não há fontes vinculadas, sharedMemory fica vazia — sem fallback pra memória deste projeto.
    boundDirs.length > 0 ? readBoundMemory(boundDirs) : Promise.resolve(""),
  ]);
  return {
    groupMemory,
    sharedMemory,
    messages: msgs.map((m) => compact(m, c)),
  };
}

const SYSTEM_BASE = `Você é um copiloto de IA embutido no painel de WhatsApp do operador (atendimento a clientes).
Trabalha sempre sobre UM grupo por vez. Responda SEMPRE em português do Brasil (pt-BR), com acentuação correta.

Você recebe, no início da conversa: o CONTEXTO do grupo (mensagens recentes já compactadas —
quem falou, papel — você/seu time/cliente —, texto, transcrições de áudio, reações) e DUAS
camadas de memória — use ambas:
- MEMÓRIA DO PROJETO (Claude Code): base de conhecimento compartilhada que o operador mantém
  nas sessões com o Claude (decisões, stack, infra, ideias). Vale pra todos os grupos.
- MEMÓRIA DESTE CLIENTE: fatos curados só deste grupo (nomes, tom de voz, prazos, preferências).
  Mais específica — quando conflitar com a do projeto, esta prevalece.

Ações:
- "resumir": entregue um resumo enxuto em até 6 linhas do que está acontecendo no grupo — pendências,
  decisões e o que aguarda resposta. Direto, sem enrolação.
- "rascunhar": escreva o texto de uma resposta pronta para ENVIAR ao cliente, no tom indicado pela
  memória. Apenas o texto da mensagem — sem saudação genérica forçada, sem assinatura, sem comentários
  meta ("aqui está o rascunho"). Ele ainda passará por revisão humana antes de ir.
- "sugerir": a ÚLTIMA mensagem do cliente (papel "client") é o ALVO ainda não respondido. Faça DUAS
  coisas num passo só. (1) VALIDE: se o cliente alega algo (ex.: "faltou X", "foi acordado Y",
  "vocês prometeram Z"), confronte a alegação com as DUAS memórias. (2) REDIJA a próxima resposta a
  enviar, no tom da memória, apoiada nos fatos quando houver base. Formato de saída OBRIGATÓRIO:
  a PRIMEIRA linha é só um marcador de origem — "[[MEM:ok]]" se a resposta se apoia em algo concreto
  das memórias, ou "[[MEM:none]]" se não há nada curado sobre o assunto (resposta genérica). Da
  SEGUNDA linha em diante, APENAS o texto da mensagem pronto pra colar — sem saudação genérica
  forçada, sem assinatura, sem comentários meta, sem repetir o marcador.
- "followup": VOCÊ enviou a última mensagem e ninguém respondeu há um tempo. Rascunhe um
  follow-up leve e educado pra retomar a conversa, no tom da memória — sem soar cobrando nem
  ansioso, sem repetir literalmente o que você já disse. Mesmo formato da "sugerir": 1ª linha o
  marcador [[MEM:ok]] ou [[MEM:none]]; depois só o texto da mensagem pronto pra colar.

Para chat livre, responda de forma útil e concisa sobre o grupo.`;

export interface BuildPromptArgs {
  /** Memória curada deste cliente (editável no painel). */
  groupMemory: string;
  /** Memória do Claude Code (compartilhada), já formatada como texto. */
  sharedMemory: string;
  messages: CompactMsg[];
  action?: CopilotAction;
  chat: ChatMessage[];
  /** Timestamp ISO do balão-alvo (ação "sugerir"): marca qual msg do cliente responder. */
  targetTimestamp?: string;
}

/** Bloco de system neutro. `cache` marca o ponto de cache (provedores que suportam usam). */
export interface PromptBlock {
  text: string;
  cache?: boolean;
}

/**
 * Prompt em shape NEUTRO (não específico de provedor). lib/llm.ts adapta isto pro
 * formato de cada provedor (Anthropic = blocos de system + cache_control; OpenAI/
 * OpenRouter = um único system message + messages).
 */
export interface NeutralPrompt {
  system: PromptBlock[];
  messages: ChatMessage[];
}

/**
 * Monta o prompt neutro: bloco estável (instrução base + as duas camadas de memória,
 * marcado pra cache) + conteúdo volátil (contexto das mensagens + histórico + ação).
 */
export function buildPrompt({
  groupMemory,
  sharedMemory,
  messages,
  action,
  chat,
  targetTimestamp,
}: BuildPromptArgs): NeutralPrompt {
  const sharedBlock = sharedMemory.trim()
    ? `MEMÓRIA DO PROJETO (Claude Code — compartilhada entre grupos):\n${sharedMemory.trim()}`
    : "MEMÓRIA DO PROJETO (Claude Code): (vazia)";
  const groupBlock = groupMemory.trim()
    ? `MEMÓRIA DESTE CLIENTE (fatos curados deste grupo):\n${groupMemory.trim()}`
    : "MEMÓRIA DESTE CLIENTE: (vazia — nenhum fato curado ainda)";

  const system: PromptBlock[] = [
    { text: SYSTEM_BASE },
    { text: sharedBlock },
    { text: groupBlock, cache: true },
  ];

  const contexto =
    `CONTEXTO DO GRUPO — últimas ${messages.length} mensagens (mais recentes por último):\n` +
    JSON.stringify(messages, null, 2);

  const out: ChatMessage[] = [{ role: "user", content: contexto }];
  for (const m of chat) out.push({ role: m.role, content: m.content });

  if (action === "resumir") {
    out.push({ role: "user", content: "Resuma o grupo agora (até 6 linhas)." });
  } else if (action === "rascunhar") {
    out.push({
      role: "user",
      content:
        "Rascunhe uma resposta para enviar ao cliente neste grupo, no tom da memória. Apenas o texto da mensagem.",
    });
  } else if (action === "sugerir") {
    const alvo = targetTimestamp
      ? `O ALVO é a mensagem do cliente com timestamp ${targetTimestamp} (a última ainda não respondida).`
      : "O ALVO é a última mensagem do cliente ainda não respondida.";
    out.push({
      role: "user",
      content:
        `${alvo} Valide as alegações do cliente contra as memórias e redija a próxima resposta a enviar. ` +
        "Siga o formato: 1ª linha o marcador [[MEM:ok]] ou [[MEM:none]]; depois só o texto da mensagem.",
    });
  } else if (action === "followup") {
    const quando = targetTimestamp
      ? `Sua última mensagem (timestamp ${targetTimestamp}) ficou sem resposta.`
      : "Sua última mensagem ficou sem resposta.";
    out.push({
      role: "user",
      content:
        `${quando} Rascunhe um follow-up leve pra retomar, no tom da memória. ` +
        "Siga o formato: 1ª linha o marcador [[MEM:ok]] ou [[MEM:none]]; depois só o texto da mensagem.",
    });
  }

  return { system, messages: out };
}
