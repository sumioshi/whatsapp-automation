"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, cn, ScanShimmer } from "../ui";

/** Sugestões dispensadas nesta sessão (não reaparecem ao repollar). */
const dismissedSuggestions = new Set<string>();

/* Cartão de sugestão do copiloto (resposta sugerida / follow-up) exibido na
   conversa. Extraído do Timeline. */

export function SuggestionCard({
  slug,
  messageId,
  followup = false,
  onUseDraft,
}: {
  slug: string;
  messageId: string;
  /** true = follow-up (minha msg sem resposta) em vez de sugestão de resposta. */
  followup?: boolean;
  onUseDraft?: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [grounded, setGrounded] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(() => dismissedSuggestions.has(messageId));
  const abortRef = useRef<AbortController | null>(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }, []);

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
        // Opt-in off / sem provedor / alvo inválido: silencia o card (sem ruído).
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
                /* frame fora do contrato → ignora */
              }
            }
            sep = buffer.indexOf("\n\n");
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Não consegui sugerir. Tente de novo.");
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [slug, messageId],
  );

  // Auto-dispara 1x por alvo, com debounce (o poll é 3s — espera estabilizar).
  // Cancela em voo ao trocar de alvo/desmontar. Não dispara se foi dispensado.
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

  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "relative ml-2 max-w-[560px] rounded-card border border-accent/20 bg-accent/[0.04] px-3 py-2.5",
          reduceMotion.current ? "" : "reveal",
        )}
      >
        <div className="mb-1.5 flex items-center gap-2">
          <span className="mono text-[10px] uppercase tracking-wider text-accent">
            {followup ? "follow-up" : "sugestão"}
          </span>
          {grounded !== null && (
            <span
              className={cn(
                "mono text-[10px] tracking-wide",
                grounded ? "text-accent/80" : "text-fg-faint",
              )}
              title={
                grounded
                  ? "A resposta se apoia na memória curada/projeto."
                  : "Sem fato curado sobre o assunto — sugestão genérica."
              }
            >
              {grounded ? "✓ com base na memória" : "⚠ sem base na memória"}
            </span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dispensar sugestão"
            className="focus-ring grid h-5 w-5 place-items-center rounded text-fg-faint transition-colors hover:text-fg"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && !hasText ? (
          <ScanShimmer lines={2} className="w-full max-w-sm" />
        ) : error ? (
          <div className="flex items-center gap-2">
            <span className="mono text-[11px] text-danger">{error}</span>
            <button
              type="button"
              onClick={() => void run(true)}
              className="mono text-[11px] text-fg-dim underline hover:no-underline"
            >
              tentar de novo
            </button>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg/90">{text}</p>
        )}

        {hasText && !error && (
          <div className="mt-2 flex items-center gap-1.5">
            <Button
              variant="subtle"
              size="sm"
              disabled={!onUseDraft || loading}
              onClick={() => onUseDraft?.(text.trim())}
            >
              → usar
            </Button>
            <Button variant="ghost" size="sm" disabled={loading} onClick={() => void run(true)}>
              regenerar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Balão de enquete: pergunta em destaque, cada opção com barra de proporção
 * (ember sutil) + contagem, total embaixo, e "você votou" quando aplicável.
 * Atualiza no polling existente (recebe `poll` já apurado do servidor).
 */
