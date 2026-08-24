"use client";

import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MessageView, PollView } from "@/lib/data";
import { LiveAudio } from "./LiveAudio";
import { PresenceLine } from "./PresenceLine";
import { Button, cn, IconButton, NumberTicker, ScanShimmer } from "./ui";
import { Bubble } from "./chat/Bubble";
import { type Contacts, formatTime, numberFromJid } from "./chat/format";
const dismissedSuggestions = new Set<string>();


function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Rótulo do separador de dia: HOJE / ONTEM / DD/MM/AAAA. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "hoje";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="flex items-center justify-center py-2">
      <span className="mono rounded-full border border-line bg-surface px-2.5 py-0.5 text-[10px] text-fg-faint">
        {dayLabel(iso)}
      </span>
    </div>
  );
}

/**
 * Linha de sistema discreta (mono, esmaecida) para uma chamada — não é balão.
 * Ordenada por timestamp junto das mensagens. Ex.: "📞 Chamada de Fulano ·
 * perdida" / "🎥 Chamada de vídeo de Fulano · atendida".
 */
function CallLine({ m }: { m: MessageView }) {
  const call = m.call;
  if (!call) return null;
  const icon = call.isVideo ? "🎥" : "📞";
  const kind = call.isVideo ? "Chamada de vídeo" : "Chamada";
  const outcomeLabel: Record<string, string> = {
    missed: "perdida",
    accepted: "atendida",
    rejected: "recusada",
    ongoing: "em andamento",
  };
  const outcome = outcomeLabel[call.outcome] ?? call.outcome;
  const missed = call.outcome === "missed";
  const who = m.senderName && m.senderName !== "desconhecido" ? ` de ${m.senderName}` : "";
  return (
    <div className="flex items-center justify-center py-1.5">
      <span
        className={cn(
          "mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px]",
          missed
            ? "border-danger/30 bg-danger/5 text-danger/80"
            : "border-line bg-surface text-fg-faint",
        )}
        title={`${formatTime(m.timestamp)} · ${kind}${who} · ${outcome}`}
      >
        <span aria-hidden>{icon}</span>
        <span>
          {kind}
          {who} · {outcome}
        </span>
      </span>
    </div>
  );
}

// Tempo que a MINHA última mensagem precisa ficar sem resposta pra sugerir follow-up.
// (Espelha COPILOT_FOLLOWUP_AFTER_MIN do servidor; drift é inofensivo — a rota revalida.)
const FOLLOWUP_AFTER_MS = 60 * 60_000;

function SegmentedFilter({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.key === value),
  );
  return (
    <div className="relative grid auto-cols-fr grid-flow-col rounded-control border border-line bg-surface-2 p-0.5">
      <span
        aria-hidden
        className="absolute inset-y-0.5 rounded-[6px] bg-elevated shadow-sm transition-transform duration-200"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${idx * 100}%)`,
          transitionTimingFunction: "var(--ease-out-quint)",
        }}
      />
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`relative z-10 rounded-[6px] px-3 py-1 text-xs font-medium transition-colors ${
            value === o.key ? "text-accent" : "text-fg-dim hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Timeline({
  slug,
  groupName,
  messages: initial,
  draft,
  onUseDraft,
}: {
  slug: string;
  groupName: string;
  messages: MessageView[];
  /** Rascunho do copiloto pra injetar no composer (elevado pelo GroupWorkspace). */
  draft?: { text: string; nonce: number } | null;
  /** Cola um texto no composer (ponte draft→composer). Usado pelo card de sugestão. */
  onUseDraft?: (text: string) => void;
}) {
  const [messages, setMessages] = useState<MessageView[]>(initial);
  const [teamIds, setTeamIds] = useState<Set<string>>(new Set());
  const [copilotOn, setCopilotOn] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [mediaFilter, setMediaFilter] = useState("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const filterOptions = useMemo(() => {
    const order = ["audio", "image", "video", "gif", "document", "sticker"] as const;
    const labels: Record<string, string> = {
      audio: "Áudio",
      image: "Imagem",
      video: "Vídeo",
      gif: "GIF",
      document: "Doc",
      sticker: "Fig.",
    };
    const present = new Set(messages.map((m) => m.type));
    const opts = [{ key: "all", label: "Tudo" }];
    for (const t of order) if (present.has(t)) opts.push({ key: t, label: labels[t] ?? t });
    return opts;
  }, [messages]);

  const shown = useMemo(
    () => (mediaFilter === "all" ? messages : messages.filter((m) => m.type === mediaFilter)),
    [messages, mediaFilter],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 400);
  }, []);

  const jumpToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, []);
  // Ids do carregamento inicial — só anima a entrada do que chegar DEPOIS (estado),
  // sem orquestrar a página inteira no primeiro load.
  const initialIds = useRef(new Set(initial.map((m) => m.id)));

  // Carrega quem é do time (pra marcar "time" e separar de cliente).
  useEffect(() => {
    fetch("/api/team", { cache: "no-store" })
      .then((r) => r.json())
      .then((cs: Array<{ id: string; role: string }>) =>
        setTeamIds(new Set(cs.filter((c) => c.role === "team").map((c) => c.id))),
      )
      .catch(() => {});
  }, []);

  // Opt-in do copiloto neste grupo: sem ele, nenhum card de sugestão é montado/disparado.
  useEffect(() => {
    let alive = true;
    setCopilotOn(false);
    fetch("/api/triage", { cache: "no-store" })
      .then((r) => r.json())
      .then((t: { copilot?: Record<string, boolean> }) => {
        if (alive) setCopilotOn(Boolean(t.copilot?.[slug]));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug]);

  // Marca o grupo como visto ao abrir e atualiza a sidebar (zera as não-lidas).
  useEffect(() => {
    fetch("/api/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lastSeen", slug, value: new Date().toISOString() }),
    })
      .then(() => router.refresh())
      .catch(() => {});
  }, [slug, router]);

  // Mapa de id->nome (de quem já mandou mensagem) + os ids que são "você".
  const contacts = useMemo<Contacts>(() => {
    const names = new Map<string, string>();
    const mine = new Set<string>();
    for (const m of messages) {
      const num = numberFromJid(m.sender);
      if (num && !names.has(num)) names.set(num, m.senderName);
      if (num && m.fromMe) mine.add(num);
    }
    return { names, mine, team: teamIds };
  }, [messages, teamIds]);

  // "Agora" definido só no cliente (evita mismatch de hydration); habilita a regra de
  // tempo do follow-up. Atualiza a cada 60s pra um follow-up "amadurecer" sem reload.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Alvo da sugestão automática (1 chamada por turno; msgs antigas nunca disparam):
  //  - última mensagem RECEBIDA (não-minha) → sugerir resposta;
  //  - última mensagem MINHA parada há ≥ FOLLOWUP_AFTER_MS → sugerir follow-up.
  const suggest = useMemo<{ id: string; followup: boolean } | null>(() => {
    if (!copilotOn) return null;
    const last = messages[messages.length - 1];
    if (!last) return null;
    if (!last.fromMe) return { id: last.id, followup: false };
    // Follow-up: minha última msg ficou sem resposta tempo suficiente.
    if (!nowMs) return null;
    const ageMs = nowMs - new Date(last.timestamp).getTime();
    if (ageMs < FOLLOWUP_AFTER_MS) return null;
    return { id: last.id, followup: true };
  }, [messages, copilotOn, nowMs]);
  const suggestTargetId = suggest?.id ?? null;

  // Busca novas mensagens periodicamente (a tela atualiza sozinha, sem F5).
  // Só re-renderiza quando a resposta muda de verdade (evita reconciliar a lista
  // inteira a cada 3s) — compara o corpo cru antes de parsear/setar.
  const lastBodyRef = useRef<string>("");
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages?slug=${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = await res.text();
      if (body === lastBodyRef.current) return; // nada mudou → não mexe no estado
      lastBodyRef.current = body;
      setMessages(JSON.parse(body) as MessageView[]);
    } catch {
      /* coletor/painel pode estar reiniciando */
    }
  }, [slug]);

  useEffect(() => {
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [poll]);

  // Ao ABRIR/trocar de grupo, vai direto pro fim (mensagens mais recentes).
  // biome-ignore lint/correctness/useExhaustiveDependencies: rola ao abrir/trocar grupo
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [slug]);

  // Quando chega mensagem nova, acompanha o fim só se já estiver perto dele.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rola ao mudar a contagem
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line bg-surface px-5 py-3">
        <button
          type="button"
          title="Voltar"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else window.location.assign("/clientes");
          }}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-control border border-line bg-surface-2 text-fg-dim transition-colors hover:text-fg"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
        </button>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-line bg-surface-2 text-xs font-semibold text-fg-dim">
          {groupName.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium text-fg">{groupName}</div>
          {/* Presença (digitando/online/visto) substitui o contador quando há
              sinal; sem sinal, mostra o contador de mensagens (fallback). */}
          <PresenceLine
            slug={slug}
            fallback={
              <span className="mono flex items-center gap-1 text-[11px] text-fg-faint">
                <NumberTicker value={messages.length} />
                {messages.length === 1 ? "mensagem" : "mensagens"}
              </span>
            }
          />
        </div>
      </header>

      {filterOptions.length > 1 && (
        <div className="border-b border-line bg-surface px-4 py-2 md:px-10">
          <SegmentedFilter options={filterOptions} value={mediaFilter} onChange={setMediaFilter} />
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="signal-grid flex-1 space-y-2.5 overflow-y-auto px-4 py-6 md:px-10"
        >
          {shown.length === 0 ? (
            <p className="mono mt-12 text-center text-sm text-fg-faint">
              {mediaFilter === "all"
                ? "Nenhuma mensagem capturada ainda neste grupo."
                : "Nada deste tipo neste grupo."}
            </p>
          ) : (
            shown.map((m, i) => {
              const prev = shown[i - 1];
              const showDay = !prev || dayKey(prev.timestamp) !== dayKey(m.timestamp);
              return (
                <Fragment key={m.id}>
                  {showDay && <DaySeparator iso={m.timestamp} />}
                  {m.type === "call" && m.call ? (
                    <CallLine m={m} />
                  ) : (
                    <Bubble
                      slug={slug}
                      m={m}
                      contacts={contacts}
                      fresh={!initialIds.current.has(m.id)}
                    />
                  )}
                  {m.id === suggestTargetId && (
                    <SuggestionCard
                      slug={slug}
                      messageId={m.id}
                      followup={suggest?.followup ?? false}
                      onUseDraft={onUseDraft}
                    />
                  )}
                </Fragment>
              );
            })
          )}
        </div>

        {showJump && (
          <button
            type="button"
            onClick={jumpToBottom}
            aria-label="Descer para o fim"
            className="pop-in absolute right-5 bottom-4 grid h-10 w-10 place-items-center rounded-full border border-line bg-elevated text-fg-dim shadow-lg shadow-black/40 transition-colors hover:text-fg"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      <Composer groupJid={messages.at(-1)?.groupJid ?? null} onSent={poll} draft={draft} />
    </>
  );
}

/** Deriva o 'kind' do coletor a partir do MIME do arquivo escolhido. */
function kindOf(file: File): "image" | "video" | "audio" | "document" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

function Composer({
  groupJid,
  onSent,
  draft,
}: {
  groupJid: string | null;
  onSent: () => void;
  /** Rascunho injetado pelo copiloto. `nonce` muda a cada envio pra reaplicar o mesmo texto. */
  draft?: { text: string; nonce: number } | null;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{ file: File; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Copiloto manda um rascunho → preenche o composer (nunca envia) e foca pro operador revisar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reaplica só quando o nonce muda
  useEffect(() => {
    if (draft?.text) {
      setText(draft.text);
      taRef.current?.focus();
    }
  }, [draft?.nonce]);

  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { file, url: URL.createObjectURL(file) };
    });
  }

  function clearPending() {
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  // Revoga o ObjectURL da imagem colada ao trocar/desmontar (evita leak de memória).
  useEffect(() => {
    return () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage.url);
    };
  }, [pendingImage]);

  // Enter / botão Enviar: manda a imagem colada (legenda = texto) se houver, senão texto.
  async function submit() {
    if (pendingImage) {
      const file = pendingImage.file;
      clearPending();
      await sendFile(file);
      return;
    }
    send();
  }

  async function send() {
    const body = text.trim();
    if (!body || !groupJid || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: groupJid, text: body }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "falha no envio");
      setText("");
      // Atualiza assim que o coletor registrar a própria mensagem.
      setTimeout(onSent, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
    } finally {
      setSending(false);
    }
  }

  async function sendFile(file: File) {
    if (!groupJid || sending) return;
    setSending(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("jid", groupJid);
      form.set("kind", kindOf(file));
      form.set("file", file);
      if (text.trim()) form.set("caption", text.trim());
      const res = await fetch("/api/send-media", { method: "POST", body: form });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "falha no envio");
      setText("");
      setTimeout(onSent, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-line bg-surface px-4 py-3">
      {error && <p className="mono mb-1.5 text-xs text-danger">{error}</p>}
      {pendingImage && (
        <div className="pop-in mb-2 inline-flex items-center gap-2 rounded-control border border-line bg-surface-2 p-1.5 pr-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingImage.url} alt="" className="h-10 w-10 rounded object-cover" />
          <span className="mono text-[11px] text-fg-dim">imagem colada</span>
          <button
            type="button"
            onClick={clearPending}
            aria-label="Remover imagem"
            className="mono text-xs text-fg-faint hover:text-danger"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) sendFile(f);
            e.target.value = "";
          }}
        />
        <IconButton
          title="Anexar arquivo (a legenda usa o texto escrito)"
          onClick={() => fileRef.current?.click()}
          disabled={!groupJid || sending}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-label="Anexar"
            role="img"
          >
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </IconButton>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={groupJid ? "Responder…  (Enter envia · Ctrl+V cola imagem)" : "Sem grupo para responder"}
          disabled={!groupJid || sending}
          className="focus-ring max-h-32 min-h-[40px] flex-1 resize-none rounded-control border border-line bg-surface-2 px-3 py-2.5 text-sm text-fg placeholder:text-fg-faint disabled:opacity-60"
        />
        <Button
          onClick={submit}
          loading={sending}
          disabled={!groupJid || (!text.trim() && !pendingImage)}
          className="h-10"
        >
          {sending ? "Enviando…" : "Enviar"}
        </Button>
      </div>
    </div>
  );
}

function SuggestionCard({
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