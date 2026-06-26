"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Input, ScanShimmer, SectionLabel, Textarea, Toggle, cn } from "./ui";

interface ProjectInfo {
  slug: string;
  dir: string;
  name: string;
  count: number;
}

/** Papéis de uma mensagem do chat do copiloto (sessão local, não persistida na v1). */
type Role = "user" | "assistant";
interface ChatMessage {
  role: Role;
  content: string;
}

/** Ações rápidas (chips) — só as 2 do MVP. */
type CopilotAction = "resumir" | "rascunhar";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface CopilotPanelProps {
  slug: string;
  /**
   * Entrega um rascunho ao composer (Fase 7 — elevação de estado feita pelo
   * GroupWorkspace). Quando ausente, o botão "→ composer" não é mostrado.
   * NUNCA envia: só preenche o composer pro operador editar/humanizar/confirmar.
   */
  onDraft?: (text: string) => void;
}

const ACTION_LABEL: Record<CopilotAction, string> = {
  resumir: "Resumir conversa",
  rascunhar: "Rascunhar resposta",
};

const ACTION_ICON: Record<CopilotAction, React.ReactNode> = {
  resumir: (
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
  ),
  rascunhar: (
    <>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </>
  ),
};

/**
 * Copiloto de IA por grupo (opt-in). Chat livre + 2 ações rápidas (resumir /
 * rascunhar) sobre o contexto do grupo, mais a "memória do cliente" curada que
 * o copiloto usa. Consome as rotas /api/copilot/* (SSE no chat) e o opt-in vive
 * no /api/triage (action "copilot"). Espelha o padrão do NotesPanel.
 */
/** Estado do provedor de IA (GET /api/copilot/status). */
interface ProviderStatus {
  ready: boolean;
  label?: string;
  model?: string;
  draftModel?: string;
}

export function CopilotPanel({ slug, onDraft }: CopilotPanelProps) {
  // Opt-in: undefined = ainda carregando o estado do grupo.
  const [enabled, setEnabled] = useState<boolean | undefined>(undefined);
  const [toggling, setToggling] = useState(false);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);

  // Carrega o opt-in do grupo ao montar (e ao trocar de grupo).
  useEffect(() => {
    let alive = true;
    setEnabled(undefined);
    fetch("/api/triage", { cache: "no-store" })
      .then((r) => r.json())
      .then((t: { copilot?: Record<string, boolean> }) => {
        if (alive) setEnabled(Boolean(t.copilot?.[slug]));
      })
      .catch(() => {
        if (alive) setEnabled(false);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  // Provedor de IA configurado (rótulo + modelos). Independe do grupo.
  useEffect(() => {
    let alive = true;
    fetch("/api/copilot/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: ProviderStatus) => {
        if (alive) setProvider(s);
      })
      .catch(() => {
        if (alive) setProvider({ ready: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  const destino = provider?.label ?? "ao provedor de IA";

  // Liga/desliga o copiloto no grupo (persiste no .triage.json).
  const toggleCopilot = useCallback(
    async (next: boolean) => {
      setToggling(true);
      // Atualização otimista — reverte em erro.
      setEnabled(next);
      try {
        const res = await fetch("/api/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "copilot", slug, value: next }),
        });
        const data = (await res.json()) as { ok?: boolean };
        if (!res.ok || !data.ok) throw new Error("falha ao alternar copiloto");
      } catch {
        setEnabled(!next);
      } finally {
        setToggling(false);
      }
    },
    [slug],
  );

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* ── Header: opt-in toggle ──────────────────────────────────────── */}
      <section className="rounded-card border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <SectionLabel>Copiloto IA</SectionLabel>
            {provider?.ready && provider.label && (
              <ProviderChip label={provider.label} model={provider.model} />
            )}
          </div>

          {/* Toggle: loading skeleton enquanto undefined, toggle real quando carregado */}
          {enabled === undefined ? (
            <div className="h-6 w-11 animate-pulse rounded-full bg-line-2 opacity-60" />
          ) : (
            <Toggle
              checked={enabled === true}
              onChange={toggleCopilot}
              disabled={toggling}
              aria-label={enabled ? "Desligar copiloto neste grupo" : "Ligar copiloto neste grupo"}
            />
          )}
        </div>

        {/* Estado desligado: explica o que acontece ao ligar */}
        {enabled === false && (
          <p className="mt-3 text-[13px] leading-relaxed text-fg-faint">
            Ligue pra resumir a conversa e rascunhar respostas com o contexto deste grupo.{" "}
            <span className="text-fg-dim">
              Ao ligar, a conversa será enviada {destino}
              {provider?.model ? ` (${provider.model})` : ""}.
            </span>
          </p>
        )}
      </section>

      {/* ── Chat + memória (só quando ligado) ─────────────────────────── */}
      {enabled === true && (
        <>
          <CopilotChat slug={slug} onDraft={onDraft} provider={provider} />
          <MemoryCard slug={slug} />
          <MemorySourcesCard slug={slug} />
        </>
      )}
    </div>
  );
}

/* ── Chip discreto de provedor ──────────────────────────────────────── */

function ProviderChip({ label, model }: { label: string; model?: string }) {
  return (
    <span className="mono text-[10px] text-fg-faint/70 leading-none">
      {label}
      {model && (
        <>
          <span className="mx-1 text-fg-faint/40">·</span>
          {model}
        </>
      )}
    </span>
  );
}

/* ── Chat + ações rápidas (SSE streaming) ───────────────────────────── */

function CopilotChat({
  slug,
  onDraft,
  provider,
}: CopilotPanelProps & { provider: ProviderStatus | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [noApiKey, setNoApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Marca a última resposta como vinda da ação "rascunhar" (habilita "→ composer").
  const [lastWasDraft, setLastWasDraft] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);

  // Mantém o fim da conversa visível enquanto streama.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Cancela um stream em andamento ao desmontar/trocar de grupo.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const busy = streaming;

  /**
   * Dispara uma chamada ao copiloto. `userMessage` entra como turno do usuário
   * no histórico; `action` (resumir/rascunhar) vai no corpo pra rota montar o
   * prompt. Consome o SSE e vai escrevendo a resposta token a token.
   */
  const send = useCallback(
    async (userMessage: string, action?: CopilotAction) => {
      if (busy) return;
      setError(null);
      setLastWasDraft(action === "rascunhar");

      const history = [...messages, { role: "user" as const, content: userMessage }];
      setMessages([...history, { role: "assistant", content: "" }]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/copilot/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, action, messages: history }),
          signal: controller.signal,
        });

        if (res.status === 503) {
          setNoApiKey(true);
          setMessages(messages); // descarta o turno otimista
          return;
        }
        if (!res.ok || !res.body) {
          throw new Error(`falha na resposta (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Parser de text/event-stream: acumula até "\n\n", lê linhas "data:".
        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) return;
          buffer += decoder.decode(value, { stream: true });

          let sep: number = buffer.indexOf("\n\n");
          while (sep !== -1) {
            const rawEvent = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            handleEvent(rawEvent);
            sep = buffer.indexOf("\n\n");
          }
          return pump();
        };

        const handleEvent = (rawEvent: string) => {
          for (const line of rawEvent.split("\n")) {
            const trimmed = line.trimStart();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trimStart();
            if (payload === "[DONE]") return;

            let delta = payload;
            // A rota pode mandar JSON ({text} ou {error}) ou texto cru.
            try {
              const parsed = JSON.parse(payload) as { text?: string; error?: string };
              if (parsed.error === "no_api_key") {
                setNoApiKey(true);
                return;
              }
              if (typeof parsed.text === "string") delta = parsed.text;
              else if (parsed.error) {
                setError(parsed.error);
                return;
              }
            } catch {
              // payload não-JSON → texto cru, usa como veio
            }

            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = { ...last, content: last.content + delta };
              }
              return next;
            });
          }
        };

        await pump();
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Não consegui falar com o copiloto. Tente de novo.");
        // Remove o balão de resposta vazio que ficou pendurado.
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.content === "") return prev.slice(0, -1);
          return prev;
        });
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, messages, slug],
  );

  function onSubmit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    // Refoca o textarea após enviar
    setTimeout(() => {
      composerRef.current?.querySelector("textarea")?.focus();
    }, 0);
    void send(text);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  const lastAssistant =
    messages.length && messages[messages.length - 1].role === "assistant"
      ? messages[messages.length - 1].content
      : "";
  const showDraftToComposer =
    Boolean(onDraft) && lastWasDraft && !streaming && lastAssistant.trim().length > 0;

  const hasMessages = messages.length > 0;

  return (
    <section className="flex min-h-0 flex-col rounded-card border border-line bg-surface">
      {/* ── Ações rápidas ─────────────────────────────────────────────── */}
      <div className="border-b border-line px-3 pt-3 pb-2.5">
        <SectionLabel className="mb-2">Ações rápidas</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(ACTION_LABEL) as CopilotAction[]).map((action) => (
            <ActionChip
              key={action}
              action={action}
              disabled={busy || noApiKey}
              onClick={() => send(ACTION_LABEL[action], action)}
            />
          ))}
        </div>
      </div>

      {/* ── Banner: nenhuma chave de API ──────────────────────────────── */}
      {noApiKey && (
        <div className="mx-3 mt-3 rounded-control border border-danger/25 bg-danger/8 px-3 py-2.5">
          <p className="text-[12px] leading-relaxed text-danger">
            Nenhum provedor configurado.{" "}
            <span className="text-danger/70">
              Defina o provedor em <span className="mono">web/.env.local</span> (OpenRouter,
              Anthropic ou local) pra usar o copiloto.
            </span>
          </p>
        </div>
      )}

      {/* ── Conversa ──────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className={cn(
          "flex flex-col gap-2 overflow-y-auto px-3",
          hasMessages ? "py-3" : "py-0",
          "max-h-72",
        )}
      >
        {!hasMessages && !streaming ? (
          /* Empty state — só aparece quando sem mensagens E sem streaming */
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="text-fg-faint/50" aria-hidden>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 8V4H8" />
                <rect width="16" height="12" x="4" y="8" rx="2" />
                <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
              </svg>
            </span>
            <p className="text-[12px] leading-relaxed text-fg-faint">
              Use uma ação rápida ou faça uma pergunta sobre este grupo.
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <ChatBubble
              // biome-ignore lint/suspicious/noArrayIndexKey: histórico append-only, sem reordenação
              key={i}
              role={m.role}
              content={m.content}
              pending={
                m.role === "assistant" &&
                i === messages.length - 1 &&
                streaming &&
                m.content === ""
              }
            />
          ))
        )}
      </div>

      {/* ── Feedback de erro inline ────────────────────────────────────── */}
      {error && (
        <p className="mono mx-3 mt-1 text-[11px] text-danger">{error}</p>
      )}

      {/* ── Botão "→ composer" (após rascunho) ────────────────────────── */}
      {showDraftToComposer && (
        <div className="flex justify-end px-3 pt-1 pb-0">
          <Button variant="subtle" size="sm" onClick={() => onDraft?.(lastAssistant)}>
            → composer
          </Button>
        </div>
      )}

      {/* ── Composer ──────────────────────────────────────────────────── */}
      <div className="border-t border-line p-3">
        <div ref={composerRef} className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            disabled={noApiKey}
            placeholder="Pergunte ao copiloto… (Enter para enviar)"
            aria-label="Mensagem para o copiloto"
            className="text-[13px]"
          />
          <Button
            size="sm"
            loading={busy}
            disabled={busy || noApiKey || !input.trim()}
            onClick={onSubmit}
            aria-label="Enviar mensagem"
          >
            {busy ? null : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
            )}
          </Button>
        </div>
        <p className="mt-1.5 mono text-[10px] text-fg-faint/50">
          Shift+Enter para nova linha
        </p>
      </div>
    </section>
  );
}

/* ── Chip de ação rápida ────────────────────────────────────────────── */

function ActionChip({
  action,
  disabled,
  onClick,
}: {
  action: CopilotAction;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "pressable inline-flex items-center gap-1.5",
        "rounded-control border border-line bg-surface-2",
        "px-2.5 py-1 text-[12px] text-fg-dim",
        "hover:border-line-2 hover:text-fg",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "transition-colors",
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {ACTION_ICON[action]}
      </svg>
      {ACTION_LABEL[action]}
    </button>
  );
}

/* ── Balão de mensagem ──────────────────────────────────────────────── */

function ChatBubble({
  role,
  content,
  pending,
}: {
  role: Role;
  content: string;
  pending: boolean;
}) {
  if (pending) {
    return (
      <div className="mr-auto w-full max-w-[88%] rounded-control border border-line bg-surface-2">
        <ScanShimmer lines={3} />
      </div>
    );
  }

  if (role === "user") {
    return (
      <div className="ml-auto max-w-[88%] rounded-control bg-accent/10 px-3 py-2 text-[13px] leading-relaxed text-fg ring-1 ring-inset ring-accent/12 whitespace-pre-wrap">
        {content}
      </div>
    );
  }

  return (
    <div className="mr-auto max-w-[88%] rounded-control border border-line bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-fg-dim whitespace-pre-wrap">
      {content}
    </div>
  );
}

/* ── Memória do cliente (autosave debounced, igual NotesPanel) ──────── */

function MemoryCard({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  const load = useCallback(() => {
    let alive = true;
    fetch(`/api/copilot/memory?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { content?: string }) => {
        if (alive) {
          setValue(d.content ?? "");
          loaded.current = true;
        }
      })
      .catch(() => {
        /* rota pode não existir ainda — deixa vazio */
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  // Carrega a memória só na primeira vez que o expansível abre.
  useEffect(() => {
    if (open && !loaded.current) load();
  }, [open, load]);

  // Recarrega ao trocar de grupo (se já estava aberto). Só reage ao slug:
  // `open`/`load` são lidos via ref/estado atual, não devem rearmar o efeito.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rearmar só na troca de grupo
  useEffect(() => {
    loaded.current = false;
    if (open) load();
  }, [slug]);

  const save = useCallback(
    async (content: string) => {
      setStatus("saving");
      try {
        const res = await fetch("/api/copilot/memory", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, content }),
        });
        const data = (await res.json()) as { ok?: boolean };
        if (!res.ok || !data.ok) throw new Error("falha ao salvar");
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    },
    [slug],
  );

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setValue(next);
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), 600);
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <section className="rounded-card border border-line bg-surface">
      {/* Header clicável */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 focus:outline-none"
      >
        <div className="flex items-center gap-2">
          {/* Ícone de memória / banco */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-fg-faint"
            aria-hidden
          >
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5v14a9 3 0 0 0 18 0V5" />
            <path d="M3 12a9 3 0 0 0 18 0" />
          </svg>
          <SectionLabel>Memória do cliente</SectionLabel>
        </div>

        <span className="flex items-center gap-2">
          {open && <StatusHint status={status} />}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={cn(
              "text-fg-faint transition-transform duration-150",
              open && "rotate-180",
            )}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {/* Conteúdo expansível */}
      {open && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          <Textarea
            value={value}
            onChange={onChange}
            rows={6}
            placeholder="Fatos sobre o cliente que o copiloto deve lembrar: stack, tom, prazos, preferências…"
            aria-label="Memória do cliente"
            className="text-[13px]"
          />
        </div>
      )}
    </section>
  );
}

/* ── Fonte de memória por grupo ─────────────────────────────────────── */

function MemorySourcesCard({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<ProjectInfo[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customPath, setCustomPath] = useState("");
  const loaded = useRef(false);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    setLoadError(false);
    fetch(`/api/copilot/memory-sources?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { available?: ProjectInfo[]; selected?: string[] }) => {
        if (!alive) return;
        setAvailable(d.available ?? []);
        setSelected(d.selected ?? []);
        loaded.current = true;
      })
      .catch(() => {
        if (alive) setLoadError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    if (open && !loaded.current) load();
  }, [open, load]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: só recarrega ao trocar de grupo
  useEffect(() => {
    loaded.current = false;
    if (open) load();
  }, [slug]);

  const save = useCallback(
    async (dirs: string[]) => {
      setStatus("saving");
      try {
        const res = await fetch("/api/copilot/memory-sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, dirs }),
        });
        const data = (await res.json()) as { ok?: boolean };
        if (!res.ok || !data.ok) throw new Error("falha ao salvar");
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    },
    [slug],
  );

  function toggleDir(dir: string) {
    const next = selected.includes(dir)
      ? selected.filter((d) => d !== dir)
      : [...selected, dir];
    setSelected(next);
    void save(next);
  }

  function addCustomPath() {
    const p = customPath.trim();
    if (!p || selected.includes(p)) {
      setCustomPath("");
      return;
    }
    const next = [...selected, p];
    setSelected(next);
    setCustomPath("");
    void save(next);
  }

  function removeCustom(dir: string) {
    const next = selected.filter((d) => d !== dir);
    setSelected(next);
    void save(next);
  }

  // Dirs selecionados que não aparecem nos projetos detectados (custom paths)
  const knownDirs = new Set(available.map((p) => p.dir));
  const customSelected = selected.filter((d) => !knownDirs.has(d));

  return (
    <section className="rounded-card border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 focus:outline-none"
      >
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-fg-faint"
            aria-hidden
          >
            <path d="M4 20h16" />
            <path d="M4 16h16" />
            <path d="M4 12h16" />
            <path d="M4 8h16" />
            <path d="M4 4h16" />
          </svg>
          <SectionLabel>Fonte de memória</SectionLabel>
          {selected.length > 0 && (
            <Badge variant="accent">{selected.length}</Badge>
          )}
        </div>
        <span className="flex items-center gap-2">
          {open && <StatusHint status={status} />}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={cn(
              "text-fg-faint transition-transform duration-150",
              open && "rotate-180",
            )}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-4 pb-4 pt-3 flex flex-col gap-3">
          {loading && (
            <div className="rounded-control border border-line bg-surface-2">
              <ScanShimmer lines={3} />
            </div>
          )}

          {!loading && loadError && (
            <p className="mono text-[11px] text-danger">
              Erro ao carregar projetos.{" "}
              <button
                type="button"
                onClick={load}
                className="underline hover:no-underline"
              >
                tentar de novo
              </button>
            </p>
          )}

          {!loading && !loadError && available.length === 0 && customSelected.length === 0 && (
            <p className="text-[12px] text-fg-faint leading-relaxed">
              Nenhum projeto com memória detectado em{" "}
              <span className="mono">~/.claude/projects/</span>.
            </p>
          )}

          {!loading && !loadError && available.length > 0 && (
            <div className="flex flex-col gap-1">
              {available.map((proj) => {
                const active = selected.includes(proj.dir);
                return (
                  <button
                    key={proj.slug}
                    type="button"
                    onClick={() => toggleDir(proj.dir)}
                    className={cn(
                      "pressable flex items-center justify-between gap-3",
                      "rounded-control border px-3 py-2 text-left",
                      "transition-colors duration-100",
                      active
                        ? "border-accent/35 bg-accent/8 text-fg"
                        : "border-line bg-surface-2 text-fg-dim hover:border-line-2 hover:text-fg",
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full border",
                          active
                            ? "border-accent bg-accent"
                            : "border-line-2 bg-transparent",
                        )}
                        aria-hidden
                      />
                      <span className="mono text-[12px] truncate">{proj.name}</span>
                    </span>
                    <Badge variant={active ? "accent" : "neutral"}>
                      {proj.count}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}

          {/* Paths customizados selecionados (fora do ~/.claude) */}
          {!loading && customSelected.length > 0 && (
            <div className="flex flex-col gap-1">
              {customSelected.map((dir) => (
                <div
                  key={dir}
                  className="flex items-center justify-between gap-2 rounded-control border border-accent/35 bg-accent/8 px-3 py-2"
                >
                  <span className="mono text-[11px] text-fg truncate flex-1">{dir}</span>
                  <button
                    type="button"
                    onClick={() => removeCustom(dir)}
                    className="shrink-0 text-fg-faint hover:text-danger transition-colors"
                    aria-label="Remover"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Campo para adicionar path customizado */}
          <div className="flex gap-2">
            <Input
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addCustomPath();
              }}
              placeholder="/caminho/absoluto/para/memory"
              className="text-[12px]"
            />
            <Button
              size="sm"
              variant="subtle"
              onClick={addCustomPath}
              disabled={!customPath.trim()}
            >
              adicionar
            </Button>
          </div>
          <p className="mono text-[10px] text-fg-faint/60 -mt-1">
            Path customizado fora do ~/.claude/projects/
          </p>
        </div>
      )}
    </section>
  );
}

/** Indicador discreto do autosave (mono, text-fg-faint). Espelha o do NotesPanel. */
function StatusHint({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  const text =
    status === "saving" ? "salvando…" : status === "saved" ? "salvo" : "erro ao salvar";
  return (
    <span
      className={cn("mono text-[10px]", status === "error" ? "text-danger" : "text-fg-faint")}
    >
      {text}
    </span>
  );
}
