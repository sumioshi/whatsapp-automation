"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ScanShimmer, Icone } from "../ui";

/** Sugestões dispensadas nesta sessão (não reaparecem ao repollar). */
const dismissedSuggestions = new Set<string>();

/** Pedido explícito de rascunho ("IA" no compositor) traz de volta uma sugestão dispensada. */
export function liberarSugestao(messageId: string) {
  dismissedSuggestions.delete(messageId);
}

/**
 * Card "Rascunho da IA" no topo do compositor: a sugestão do copiloto para a
 * última mensagem do cliente (ou o acompanhamento, quando a sua última ficou
 * sem resposta). Dispara sozinho uma vez, escreve aos poucos e NUNCA envia:
 * "Usar texto" só preenche o campo para você revisar.
 */
export function SuggestionCard({
  slug,
  messageId,
  followup = false,
  onUseDraft,
}: {
  slug: string;
  messageId: string;
  /** true = acompanhamento (a sua mensagem ficou sem resposta) em vez de resposta. */
  followup?: boolean;
  onUseDraft?: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [grounded, setGrounded] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(() => dismissedSuggestions.has(messageId));
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (refresh = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      if (refresh) {
        setText("");
        setGrounded(null);
      }
      try {
        const res = await fetch("/api/copilot/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, messageId, refresh }),
          signal: controller.signal,
        });
        // Copiloto desligado, sem provedor ou alvo inválido: o card some, sem ruído.
        if (res.status === 403 || res.status === 409 || res.status === 404) {
          setLoading(false);
          dismissedSuggestions.add(messageId);
          setDismissed(true);
          return;
        }
        if (!res.ok || !res.body) throw new Error(`falha (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep = buffer.indexOf("\n\n");
          while (sep !== -1) {
            const rawEvent = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            for (const line of rawEvent.split("\n")) {
              const t = line.trimStart();
              if (!t.startsWith("data:")) continue;
              const payload = t.slice(5).trimStart();
              if (payload === "[DONE]") continue;
              try {
                const obj = JSON.parse(payload) as {
                  text?: string;
                  error?: string;
                  meta?: { groundedInMemory?: boolean };
                };
                if (obj.error) {
                  setError(obj.error);
                  return;
                }
                if (obj.meta) setGrounded(Boolean(obj.meta.groundedInMemory));
                if (typeof obj.text === "string") {
                  acc += obj.text;
                  setText(acc);
                }
              } catch {
                /* frame fora do contrato: ignora */
              }
            }
            sep = buffer.indexOf("\n\n");
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Não consegui escrever o rascunho.");
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [slug, messageId],
  );

  // Dispara uma vez por alvo, depois de a conversa assentar (o polling é de 3 s).
  useEffect(() => {
    if (dismissedSuggestions.has(messageId)) return;
    const id = setTimeout(() => void run(false), 1200);
    return () => {
      clearTimeout(id);
      abortRef.current?.abort();
    };
  }, [messageId, run]);

  if (dismissed) return null;

  function dismiss() {
    dismissedSuggestions.add(messageId);
    abortRef.current?.abort();
    setDismissed(true);
  }

  const hasText = text.trim().length > 0;
  const meta = followup
    ? "para retomar a conversa"
    : grounded === true
      ? "com base na memória do cliente"
      : grounded === false
        ? "sem base na memória do cliente"
        : loading
          ? "escrevendo…"
          : null;

  return (
    <div className="reveal m-2.5 rounded-[8px] border border-line bg-surface-2 px-3.5 py-3" aria-live="polite">
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[12px] text-fg-faint">
        <span className="inline-flex items-center gap-1 font-semibold text-id-ia">
          <Icone nome="spark" tamanho={14} />
          {followup ? "Acompanhamento da IA" : "Rascunho da IA"}
        </span>
        {meta && <span>{meta}</span>}
      </div>

      {loading && !hasText ? (
        <ScanShimmer lines={2} className="mb-3 w-full max-w-sm" />
      ) : error ? (
        <p className="mb-3 text-[13px] text-danger">{error}</p>
      ) : (
        <p className="mb-3 whitespace-pre-wrap text-[14px] leading-[1.55] text-fg">{text}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          disabled={!onUseDraft || loading || !hasText || Boolean(error)}
          onClick={() => {
            onUseDraft?.(text.trim());
            dismiss();
          }}
        >
          Usar texto
        </Button>
        <Button variant="subtle" size="sm" disabled={loading} onClick={() => void run(true)}>
          {error ? "Tentar de novo" : "Outra versão"}
        </Button>
        <Button variant="ghost" size="sm" onClick={dismiss}>
          Descartar
        </Button>
      </div>
    </div>
  );
}
