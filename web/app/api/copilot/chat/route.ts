import { NextResponse } from "next/server";
import {
  buildContext,
  buildPrompt,
  type ChatMessage,
  COPILOT_MAX_TOKENS,
  type CopilotAction,
  isCopilotEnabled,
} from "@/lib/copilot";
import { resolveProvider, streamCopilot } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatPost {
  slug?: string;
  action?: CopilotAction;
  messages?: ChatMessage[];
}

// Frame SSE só com linha `data:` — o parser do CopilotPanel lê linhas `data:` e
// aceita JSON {text}/{error} ou o literal [DONE]. Eventos nomeados ou JSON fora
// desse shape (ex.: {contextSize}) seriam anexados como texto cru ao balão, então
// mantemos o contrato mínimo que a UI já implementa.
function frame(data: string): Uint8Array {
  return new TextEncoder().encode(`data: ${data}\n\n`);
}

export async function POST(req: Request) {
  let body: ChatPost;
  try {
    body = (await req.json()) as ChatPost;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { slug, action } = body;
  if (typeof slug !== "string" || !slug) {
    return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  }
  if (action && action !== "resumir" && action !== "rascunhar") {
    return NextResponse.json({ error: "action inválida" }, { status: 400 });
  }
  const chat: ChatMessage[] = Array.isArray(body.messages)
    ? body.messages.filter(
        (m): m is ChatMessage =>
          !!m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string",
      )
    : [];

  // Isola por opt-in: grupo sem copiloto ligado nunca chama o provedor de IA.
  if (!(await isCopilotEnabled(slug))) {
    return NextResponse.json({ error: "copilot_disabled" }, { status: 403 });
  }

  // Provedor resolvido por env (OpenRouter/Anthropic/local). Key fica server-side.
  const provider = resolveProvider();
  if (!provider) {
    return NextResponse.json({ error: "no_provider" }, { status: 503 });
  }

  const { groupMemory, sharedMemory, messages } = await buildContext(slug);
  const prompt = buildPrompt({ groupMemory, sharedMemory, messages, action, chat });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const text of streamCopilot(provider, {
          prompt,
          action,
          maxTokens: COPILOT_MAX_TOKENS,
          signal: req.signal,
        })) {
          controller.enqueue(frame(JSON.stringify({ text })));
        }
        controller.enqueue(frame("[DONE]"));
      } catch (err) {
        // Trata o erro DENTRO do start — exceção não capturada derrubaria o stream sem feedback.
        // Abort do cliente (troca de grupo/desmonta) não é erro — encerra quieto.
        if ((err as Error)?.name === "AbortError") {
          controller.close();
          return;
        }
        const message = err instanceof Error ? err.message : "falha no copiloto";
        controller.enqueue(frame(JSON.stringify({ error: message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
