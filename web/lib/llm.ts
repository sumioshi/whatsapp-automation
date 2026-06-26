import Anthropic from "@anthropic-ai/sdk";
import type { CopilotAction, NeutralPrompt } from "./copilot";

/**
 * Camada de PROVEDOR do copiloto — o único lugar acoplado a um SDK/HTTP de modelo.
 * Recebe o NeutralPrompt (lib/copilot.ts) e adapta pra cada provedor:
 *  - "openai": qualquer endpoint OpenAI-compatible (OpenRouter, Ollama local, etc.)
 *  - "anthropic": SDK nativo da Anthropic.
 * Trocar de provedor/modelo é só env — nada de código.
 *
 * Misto por ação: `rascunhar` pode usar um modelo diferente (pt-BR mais natural) do
 * usado pra resumir/interpretar/chat (raciocínio). Configurável por env.
 */

export type Provider = "anthropic" | "openai";

export interface CopilotProvider {
  provider: Provider;
  /** Rótulo humano pro painel: "OpenRouter", "Anthropic", "modelo local". */
  label: string;
  /** Base URL (só openai-compatible). */
  baseUrl?: string;
  apiKey: string;
  /** Fallbacks do OpenRouter (tenta na ordem). */
  fallbacks: string[];
  /** Modelo pra uma ação (draft tem override). */
  modelFor(action?: CopilotAction): string;
}

function rotulo(baseUrl: string): string {
  if (/openrouter\.ai/.test(baseUrl)) return "OpenRouter";
  if (/localhost|127\.0\.0\.1|:11434/.test(baseUrl)) return "modelo local";
  return "OpenAI-compatible";
}

/**
 * Resolve o provedor a partir do ambiente. `COPILOT_PROVIDER` força (openai|anthropic);
 * sem ele, usa openai-compatible se tiver `COPILOT_OPENAI_API_KEY`, senão Anthropic se
 * tiver `ANTHROPIC_API_KEY`. Retorna null se nada estiver configurado (→ 503 na rota).
 */
export function resolveProvider(): CopilotProvider | null {
  const explicit = process.env.COPILOT_PROVIDER?.toLowerCase();
  const orKey = process.env.COPILOT_OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const wantOpenai = explicit === "openai" || (explicit !== "anthropic" && !!orKey);
  if (wantOpenai && orKey) {
    const baseUrl = (process.env.COPILOT_OPENAI_BASE_URL || "https://openrouter.ai/api/v1").replace(
      /\/+$/,
      "",
    );
    const model = process.env.COPILOT_OPENAI_MODEL || "openai/gpt-4o-mini";
    const draft = process.env.COPILOT_OPENAI_MODEL_DRAFT || model;
    const fallbacks = (process.env.COPILOT_OPENAI_MODELS_FALLBACK || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      provider: "openai",
      label: rotulo(baseUrl),
      baseUrl,
      apiKey: orKey,
      fallbacks,
      // sugerir = redação pt-BR (igual rascunhar) → modelo de rascunho.
      modelFor: (a) =>
        a === "rascunhar" || a === "sugerir" || a === "followup" ? draft : model,
    };
  }

  if ((explicit === "anthropic" || !explicit) && anthropicKey) {
    const model = process.env.COPILOT_ANTHROPIC_MODEL || "claude-haiku-4-5";
    const draft = process.env.COPILOT_ANTHROPIC_MODEL_DRAFT || model;
    return {
      provider: "anthropic",
      label: "Anthropic",
      apiKey: anthropicKey,
      fallbacks: [],
      // sugerir = redação pt-BR (igual rascunhar) → modelo de rascunho.
      modelFor: (a) =>
        a === "rascunhar" || a === "sugerir" || a === "followup" ? draft : model,
    };
  }

  return null;
}

export interface StreamArgs {
  prompt: NeutralPrompt;
  action?: CopilotAction;
  maxTokens: number;
  signal?: AbortSignal;
}

/** Streama a resposta do copiloto como deltas de texto (qualquer provedor). */
export async function* streamCopilot(
  p: CopilotProvider,
  args: StreamArgs,
): AsyncGenerator<string> {
  if (p.provider === "anthropic") {
    yield* streamAnthropic(p, args);
  } else {
    yield* streamOpenAICompatible(p, args);
  }
}

/* ------------------------------------------------------------------ */
/* Anthropic nativo                                                    */
/* ------------------------------------------------------------------ */

async function* streamAnthropic(
  p: CopilotProvider,
  { prompt, action, maxTokens, signal }: StreamArgs,
): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey: p.apiKey });
  const system: Anthropic.TextBlockParam[] = prompt.system.map((b) =>
    b.cache
      ? { type: "text", text: b.text, cache_control: { type: "ephemeral" } }
      : { type: "text", text: b.text },
  );
  const messages: Anthropic.MessageParam[] = prompt.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const stream = client.messages.stream(
    { model: p.modelFor(action), max_tokens: maxTokens, system, messages },
    { signal },
  );
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
      yield ev.delta.text;
    }
  }
}

/* ------------------------------------------------------------------ */
/* OpenAI-compatible (OpenRouter / Ollama / etc.)                      */
/* ------------------------------------------------------------------ */

async function* streamOpenAICompatible(
  p: CopilotProvider,
  { prompt, action, maxTokens, signal }: StreamArgs,
): AsyncGenerator<string> {
  // OpenAI-compatible usa UM system message; junta os blocos neutros.
  const systemText = prompt.system.map((b) => b.text).join("\n\n");
  const model = p.modelFor(action);
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    stream: true,
    messages: [{ role: "system", content: systemText }, ...prompt.messages],
  };
  // OpenRouter: array de fallback de modelos (tenta na ordem se o 1º falhar).
  if (p.fallbacks.length) body.models = [model, ...p.fallbacks];

  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${p.apiKey}`,
      // Identificação opcional do app (rankings/atribuição no OpenRouter).
      "HTTP-Referer": "https://github.com/sumioshi/whatsapp-automation",
      "X-Title": "Signal Room Copiloto",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    throw new Error(`provedor ${res.status}: ${extractError(txt) || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      const eventBlock = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of eventBlock.split("\n")) {
        const t = line.trimStart();
        // Comentários SSE do OpenRouter (": OPENROUTER PROCESSING") não começam com "data:".
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") return;
        let obj: {
          error?: { message?: string };
          choices?: { delta?: { content?: string } }[];
        };
        try {
          obj = JSON.parse(payload);
        } catch {
          continue;
        }
        // Erro mid-stream do OpenRouter vem como chunk com campo `error` no topo.
        if (obj.error) throw new Error(obj.error.message || "erro no provedor");
        const delta = obj.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
      sep = buffer.indexOf("\n\n");
    }
  }
}

/** Extrai a mensagem de erro de um corpo JSON do provedor (pré-stream). */
function extractError(txt: string): string {
  try {
    const j = JSON.parse(txt) as { error?: { message?: string } };
    return j.error?.message ?? "";
  } catch {
    return txt.slice(0, 160);
  }
}
