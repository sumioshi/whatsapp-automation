import { NextResponse } from "next/server";
import { buildContacts, numberFromJid, roleOf } from "@/lib/contacts";
import {
  buildContext,
  buildPrompt,
  COPILOT_MAX_TOKENS,
  isCopilotEnabled,
} from "@/lib/copilot";
import { readGroupMessages } from "@/lib/data";
import { resolveProvider, streamCopilot } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SuggestPost {
  slug?: string;
  messageId?: string;
  /** Força nova chamada ignorando o cache de processo (botão "regenerar"). */
  refresh?: boolean;
}

interface SuggestMeta {
  groundedInMemory: boolean;
}

interface CacheEntry {
  text: string;
  meta: SuggestMeta;
  signature: string;
}

// Cache de PROCESSO (sem disco): chave = slug:messageId. Zera no restart — aceitável.
// `signature` = assinatura do contexto (ids das msgs até o alvo + tamanho da memória);
// se mudar (editou memória / chegou contexto novo antes do alvo), invalida e regenera.
const CACHE = new Map<string, CacheEntry>();

function frame(data: string): Uint8Array {
  return new TextEncoder().encode(`data: ${data}\n\n`);
}

// Marcador de origem da memória que o modelo emite na 1ª linha: [[MEM:ok]] / [[MEM:none]].
const MEM_MARKER = /^\s*\[\[MEM:(ok|none)\]\]\s*\n?/i;

// Follow-up só é sugerido quando a MINHA última mensagem ficou parada esse tempo.
const FOLLOWUP_AFTER_MS = Number(process.env.COPILOT_FOLLOWUP_AFTER_MIN ?? 60) * 60_000;

export async function POST(req: Request) {
  let body: SuggestPost;
  try {
    body = (await req.json()) as SuggestPost;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { slug, messageId, refresh } = body;
  if (typeof slug !== "string" || !slug) {
    return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  }
  if (typeof messageId !== "string" || !messageId) {
    return NextResponse.json({ error: "messageId inválido" }, { status: 400 });
  }

  // Opt-in: grupo sem copiloto ligado nunca chama o provedor.
  if (!(await isCopilotEnabled(slug))) {
    return NextResponse.json({ error: "copilot_disabled" }, { status: 403 });
  }

  const provider = resolveProvider();
  if (!provider) {
    return NextResponse.json({ error: "no_provider" }, { status: 503 });
  }

  // Resolve o balão-alvo: precisa existir, ser RECEBIDO (não-meu) e sem resposta minha depois.
  const [all, contacts] = await Promise.all([readGroupMessages(slug), buildContacts()]);
  const idx = all.findIndex((m) => m.id === messageId);
  if (idx === -1) {
    return NextResponse.json({ error: "alvo não encontrado" }, { status: 404 });
  }
  const target = all[idx];
  // Modo: alvo RECEBIDO (não-meu) → sugerir resposta; alvo MEU parado → follow-up.
  const isFollowup = target.fromMe === true;
  if (isFollowup) {
    // Precisa ser a última mensagem (ninguém respondeu depois)…
    if (idx !== all.length - 1) {
      return NextResponse.json({ error: "alvo já respondido" }, { status: 409 });
    }
    // …e ter ficado parada tempo suficiente (evita follow-up logo após enviar).
    const ageMs = Date.now() - new Date(target.timestamp).getTime();
    if (ageMs < FOLLOWUP_AFTER_MS) {
      return NextResponse.json({ error: "muito cedo para follow-up" }, { status: 409 });
    }
  } else {
    // Já respondi depois do alvo? (mensagem minha após ele) → não sugere.
    const respondedAfter = all
      .slice(idx + 1)
      .some((m) => m.fromMe || roleOf(contacts, numberFromJid(m.sender)) === "me");
    if (respondedAfter) {
      return NextResponse.json({ error: "alvo já respondido" }, { status: 409 });
    }
  }
  const action = isFollowup ? "followup" : "sugerir";

  const { groupMemory, sharedMemory, messages } = await buildContext(slug);

  // Assinatura do contexto: o que invalida a sugestão se mudar.
  const cacheKey = `${slug}:${messageId}`;
  const signature = `${groupMemory.length}:${sharedMemory.length}:${all
    .slice(0, idx + 1)
    .map((m) => m.id)
    .join(",")}`;

  const cached = CACHE.get(cacheKey);
  if (!refresh && cached && cached.signature === signature) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(frame(JSON.stringify({ meta: cached.meta })));
        controller.enqueue(frame(JSON.stringify({ text: cached.text })));
        controller.enqueue(frame("[DONE]"));
        controller.close();
      },
    });
    return new Response(stream, { headers: sseHeaders() });
  }

  const prompt = buildPrompt({
    groupMemory,
    sharedMemory,
    messages,
    action,
    chat: [],
    targetTimestamp: target.timestamp,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let raw = "";
      let metaSent = false;
      let grounded = false;
      // Segura o início até decidir o marcador; depois streama o corpo limpo.
      let pending = "";
      let bodyStarted = false;

      const emitMeta = (g: boolean) => {
        grounded = g;
        metaSent = true;
        controller.enqueue(frame(JSON.stringify({ meta: { groundedInMemory: g } })));
      };

      try {
        for await (const delta of streamCopilot(provider, {
          prompt,
          action,
          maxTokens: COPILOT_MAX_TOKENS,
          signal: req.signal,
        })) {
          raw += delta;

          if (!bodyStarted) {
            // Acumula até conseguir decidir o marcador (1ª linha) sem vazar pro corpo.
            pending += delta;
            const match = MEM_MARKER.exec(pending);
            if (match) {
              emitMeta(match[1].toLowerCase() === "ok");
              const rest = pending.slice(match[0].length);
              bodyStarted = true;
              pending = "";
              if (rest) controller.enqueue(frame(JSON.stringify({ text: rest })));
            } else if (pending.includes("\n") || pending.length > 64) {
              // Sem marcador na 1ª linha: assume sem-base e trata tudo como corpo.
              emitMeta(false);
              bodyStarted = true;
              const rest = pending;
              pending = "";
              if (rest) controller.enqueue(frame(JSON.stringify({ text: rest })));
            }
            continue;
          }

          controller.enqueue(frame(JSON.stringify({ text: delta })));
        }

        // Stream terminou ainda no buffer inicial (resposta curtíssima sem \n).
        if (!bodyStarted && pending) {
          const match = MEM_MARKER.exec(pending);
          if (match) {
            emitMeta(match[1].toLowerCase() === "ok");
            const rest = pending.slice(match[0].length);
            if (rest) controller.enqueue(frame(JSON.stringify({ text: rest })));
          } else {
            if (!metaSent) emitMeta(false);
            controller.enqueue(frame(JSON.stringify({ text: pending })));
          }
        }
        if (!metaSent) emitMeta(false);

        // Guarda no cache de processo o corpo limpo (sem marcador).
        const cleanBody = raw.replace(MEM_MARKER, "").trim();
        if (cleanBody) {
          CACHE.set(cacheKey, {
            text: cleanBody,
            meta: { groundedInMemory: grounded },
            signature,
          });
        }

        controller.enqueue(frame("[DONE]"));
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          controller.close();
          return;
        }
        const message = err instanceof Error ? err.message : "falha na sugestão";
        controller.enqueue(frame(JSON.stringify({ error: message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };
}
