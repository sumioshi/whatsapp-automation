"use client";

import { useEffect, useRef, useState } from "react";
import { useRotas } from "../RotasPainel";
import type { MessageView, PollView } from "@/lib/data";
import { LiveAudio } from "../LiveAudio";
import { Button, cn, IconButton, ScanShimmer } from "../ui";
import {
  baseName,
  type Contacts,
  formatTime,
  numberFromJid,
  renderMentions,
  senderColor,
  senderLabel,
} from "./format";

/* Balão de mensagem e satélites (ações, recibos, enquete, mídia, transcrição).
   Extraído do Timeline — este arquivo é dono de TUDO que renderiza UMA mensagem. */

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🙏", "✅"];

/** Toolbar de ações que aparece no hover do balão: reagir rápido + copiar. */
function MessageActions({ slug, m }: { slug: string; m: MessageView }) {
  const rotas = useRotas();
  async function react(emoji: string) {
    try {
      const p = rotas.reagir(slug, m, emoji);
      await fetch(p.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p.body),
      });
    } catch {
      /* coletor offline — ignora */
    }
  }

  return (
    <div className="absolute -top-3.5 right-2 z-10 flex items-center gap-0.5 rounded-full border border-line bg-elevated px-1 py-0.5 opacity-0 shadow-lg shadow-black/40 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {QUICK_REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => react(e)}
          title={`Reagir ${e}`}
          className="focus-ring rounded-full px-1 text-sm leading-none transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {e}
        </button>
      ))}
      {m.text && (
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(m.text).catch(() => {})}
          title="Copiar texto"
          className="focus-ring ml-0.5 grid h-6 w-6 place-items-center rounded-full text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Check SVG simples (14×14, stroke currentColor). */
function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="2 6 5 9 10 3" />
    </svg>
  );
}

/** Duplo-check SVG (dois checks sobrepostos deslocados, 18×12). */
function DoubleCheckIcon() {
  return (
    <svg
      width="18"
      height="12"
      viewBox="0 0 18 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* primeiro check */}
      <polyline points="1 6 4 9 9 3" />
      {/* segundo check deslocado +5px à direita */}
      <polyline points="6 6 9 9 14 3" />
    </svg>
  );
}

/** ✓ enviado · ✓✓ entregue · ✓✓ ember = lido (com popover de nomes em grupo). */
function ReceiptMark({
  r,
}: {
  r: { status: string; readBy: number; deliveredBy: number; readByNames?: string[] };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  const read = r.status === "read";
  const names: string[] = r.readByNames ?? [];
  const hasNames = names.length > 0;
  // Se temos nomes, o popover é interativo; senão apenas exibe o title.
  const canOpen = read && r.readBy > 0;

  // Fecha ao pressionar Esc.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const label = read
    ? `lido${r.readBy > 0 ? ` por ${r.readBy}` : ""}`
    : r.status === "delivered"
      ? `entregue${r.deliveredBy > 0 ? ` (${r.deliveredBy})` : ""}`
      : "enviado";

  // Trigger: botão se pode abrir popover, span inerte caso contrário.
  if (!canOpen) {
    return (
      <span
        className={`mono inline-flex items-center gap-0.5 leading-none ${read ? "text-accent" : "text-fg-faint"}`}
        title={label}
        aria-label={label}
      >
        {r.status === "sent" ? <CheckIcon /> : <DoubleCheckIcon />}
      </span>
    );
  }

  return (
    <span className="relative inline-flex">
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={`mono inline-flex cursor-pointer items-center gap-0.5 leading-none text-accent transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:rounded`}
      >
        <DoubleCheckIcon />
        <span className="text-[9px]">{r.readBy}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Lido por"
          className="absolute bottom-full right-0 z-50 mb-1.5 min-w-[140px] max-w-[220px] rounded-control border border-line bg-elevated px-3 py-2 shadow-lg shadow-black/40"
        >
          <p className="mono mb-1.5 text-[9px] uppercase tracking-widest text-fg-faint">
            lido por
          </p>
          <ul className="space-y-0.5">
            {hasNames ? (
              names.map((name) => (
                <li key={name} className="mono truncate text-[11px] text-fg">
                  {name}
                </li>
              ))
            ) : (
              // Fallback para receipts antigos sem readByJids
              <li className="mono text-[11px] text-fg-dim">
                {r.readBy} {r.readBy === 1 ? "pessoa" : "pessoas"}
              </li>
            )}
          </ul>
        </div>
      )}
    </span>
  );
}

/**
 * Cartão de sugestão ancorado ABAIXO do balão da última mensagem do cliente
 * não-respondida. Auto-dispara 1x (debounce 1,2s), streama o texto sugerido,
 * mostra se há base na memória, e cola no composer via a ponte de draft.
 * NUNCA envia — só preenche pro operador revisar. Dismiss lembrado por sessão.
 */
// Dismiss por sessão (módulo): messageId dispensado não re-prefetcha ao re-renderizar.

function PollCard({ poll }: { poll: PollView }) {
  const max = Math.max(1, ...poll.options.map((o) => o.votes));
  const leadIdx = poll.options.reduce(
    (best, o, i) => (o.votes > (poll.options[best]?.votes ?? -1) ? i : best),
    0,
  );
  return (
    <div className="mt-1 w-[clamp(240px,72vw,360px)] max-w-full">
      <div className="mb-2 flex items-center gap-1.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-accent"
          aria-hidden
        >
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
        <span className="mono text-[10px] uppercase tracking-wider text-fg-faint">
          enquete{poll.multiSelect ? " · múltipla" : ""}
        </span>
      </div>

      <p className="mb-2.5 text-sm font-medium leading-snug text-fg">{poll.question}</p>

      <ul className="space-y-1.5">
        {poll.options.map((o, i) => {
          const pct = poll.totalVotes > 0 ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
          const width = (o.votes / max) * 100;
          const lead = o.votes > 0 && i === leadIdx;
          const title = o.voters.length ? `Votos: ${o.voters.join(", ")}` : undefined;
          return (
            <li
              key={o.text}
              title={title}
              className="relative overflow-hidden rounded-control border border-line bg-surface-2"
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 left-0 rounded-control transition-[width] duration-500",
                  lead ? "bg-accent/20" : "bg-accent/[0.08]",
                )}
                style={{ width: `${width}%`, transitionTimingFunction: "var(--ease-out-quint)" }}
              />
              <div className="relative flex items-center justify-between gap-2 px-2.5 py-1.5">
                <span className="truncate text-[13px] text-fg">{o.text}</span>
                <span className="mono shrink-0 text-[11px] tabular-nums text-fg-dim">
                  {o.votes}
                  {poll.totalVotes > 0 && (
                    <span className="ml-1 text-fg-faint">{pct}%</span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mono mt-2 flex items-center gap-2 text-[10px] text-fg-faint">
        <span>
          {poll.totalVotes} {poll.totalVotes === 1 ? "voto" : "votos"}
        </span>
        {poll.youVoted && (
          <span className="rounded border border-accent/30 px-1 text-accent">você votou</span>
        )}
      </div>
    </div>
  );
}

export function Bubble({
  slug,
  m,
  contacts,
  fresh = false,
}: {
  slug: string;
  m: MessageView;
  contacts: Contacts;
  fresh?: boolean;
}) {
  const mine = m.fromMe === true;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} ${fresh ? "msg-in" : ""}`}>
      <div
        className={`group relative min-w-0 max-w-[min(640px,85%)] px-3.5 py-2 transition-colors ${
          mine
            ? "rounded-[14px] rounded-br-[4px] bg-bubble-mine hover:brightness-110"
            : "rounded-[14px] rounded-bl-[4px] bg-bubble-their hover:brightness-110"
        }`}
      >
        <MessageActions slug={slug} m={m} />
        <div className="mb-1 flex items-baseline gap-2">
          {!mine && (
            <span className={`text-sm font-medium ${senderColor(m.sender)}`}>
              {m.senderName}
            </span>
          )}
          {!mine && contacts.team.has(numberFromJid(m.sender)) && (
            <span className="mono rounded border border-accent/30 px-1 text-[10px] font-medium uppercase tracking-wide text-accent">
              time
            </span>
          )}
          {mine && m.usuario && (
            <span className="mono text-[10px] font-medium text-fg-dim" title="enviado pelo painel">
              {m.usuario}
            </span>
          )}
          <span className="mono text-[10px] text-fg-faint">{formatTime(m.timestamp)}</span>
          {!m.deleted && m.type !== "text" && m.type !== "poll" && (
            <span className="mono text-[10px] uppercase tracking-wide text-fg-faint">
              {m.type}
            </span>
          )}
          {m.edited && !m.deleted && (
            <span
              className="mono text-[10px] text-fg-faint"
              title="Mensagem editada pelo autor"
            >
              editada
            </span>
          )}
          {mine && m.receipt && !m.deleted && <ReceiptMark r={m.receipt} />}
        </div>

        {m.deleted ? (
          <p className="flex items-center gap-1.5 text-sm italic leading-relaxed text-fg-faint">
            <span aria-hidden>🚫</span> mensagem apagada
          </p>
        ) : (
          <>
        {m.quotedText && (
          <div className="mb-1.5 line-clamp-4 break-words rounded-r-md border-l-2 border-accent/60 bg-bg/40 py-1 pl-2.5 pr-2 text-xs text-fg-dim">
            {senderLabel(m.quotedSender, contacts) && (
              <span
                className={`font-medium ${m.quotedSender ? senderColor(m.quotedSender) : "text-info"}`}
              >
                {senderLabel(m.quotedSender, contacts)}{" "}
              </span>
            )}
            {renderMentions(m.quotedText, contacts)}
          </div>
        )}

        <Media slug={slug} m={m} />

        {m.type === "poll" && m.poll ? (
          <PollCard poll={m.poll} />
        ) : (
          m.text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">
              {renderMentions(m.text, contacts)}
            </p>
          )
        )}

        {m.reactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {m.reactions.map((r) => (
              <span
                key={`${r.reactor}-${r.emoji}`}
                title={r.fromMe ? "você" : r.by}
                className="rounded-full border border-line bg-bg px-1.5 py-0.5 text-xs"
              >
                {r.emoji}
              </span>
            ))}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

function Media({ slug, m }: { slug: string; m: MessageView }) {
  const rotas = useRotas();
  if (!m.mediaPath) return null;
  const src = rotas.midia(m.mediaPath);

  switch (m.type) {
    case "audio":
      return (
        <div className="rounded-control border border-line bg-surface-2 p-2.5">
          <LiveAudio src={src} />
          <Transcribe slug={slug} mediaPath={m.mediaPath} initial={m.transcript} />
        </div>
      );
    case "video":
      return (
        <div className="space-y-1">
          {/* biome-ignore lint/a11y/useMediaCaption: vídeo de cliente não tem legenda */}
          <video
            controls
            preload="none"
            src={src}
            className="w-full max-w-sm rounded-control border border-line"
          />
          <Transcribe slug={slug} mediaPath={m.mediaPath} initial={m.transcript} />
        </div>
      );
    case "gif":
      return (
        <div className="space-y-1">
          {/* biome-ignore lint/a11y/useMediaCaption: GIF não tem legenda/áudio */}
          <video
            src={src}
            autoPlay
            loop
            muted
            playsInline
            className="w-full max-w-xs rounded-control border border-line"
          />
          <span className="mono text-[10px] uppercase tracking-wider text-fg-faint">gif</span>
        </div>
      );
    case "image":
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt="" className="max-w-xs rounded-control border border-line" />;
    case "sticker":
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt="" className="h-28 w-28 object-contain" />;
    case "document":
      return (
        <div className="space-y-1.5">
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-control border border-line bg-surface-2 px-2.5 py-2 text-sm text-fg transition-colors hover:border-line-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-fg-dim"
              aria-hidden
            >
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <span className="truncate text-info">{baseName(m.mediaPath)}</span>
          </a>
          <ReadDoc slug={slug} mediaPath={m.mediaPath} />
        </div>
      );
    default:
      return null;
  }
}

function ReadDoc({ slug, mediaPath }: { slug: string; mediaPath: string }) {
  const rotas = useRotas();
  const [doc, setDoc] = useState<{ text: string; pages?: number; note?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const p = rotas.documento(slug, mediaPath);
      const res = await fetch(p.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p.body),
      });
      const data = (await res.json()) as { text?: string; pages?: number; note?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "falha ao ler documento");
      setDoc({ text: data.text ?? "", pages: data.pages, note: data.note });
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
    } finally {
      setLoading(false);
    }
  }

  if (doc) {
    return (
      <div className="reveal rounded-control border border-line bg-bg/60 p-2.5 text-sm text-fg/90">
        <div className="mono mb-1 text-[10px] uppercase tracking-wider text-fg-faint">
          conteúdo do documento{doc.pages ? ` · ${doc.pages} pág.` : ""}
        </div>
        {doc.note && <p className="mb-1 text-xs text-accent-2">{doc.note}</p>}
        {doc.text && <p className="max-h-72 overflow-y-auto whitespace-pre-wrap">{doc.text}</p>}
      </div>
    );
  }

  if (loading) {
    return <ScanShimmer lines={2} className="w-full max-w-sm" />;
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={run}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        Ler conteúdo
      </Button>
      {error && <span className="mono text-xs text-danger">{error}</span>}
    </div>
  );
}

function Transcribe({
  slug,
  mediaPath,
  initial,
}: {
  slug: string;
  mediaPath: string;
  initial: string | null;
}) {
  const rotas = useRotas();
  const [transcript, setTranscript] = useState<string | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const p = rotas.transcrever(slug, mediaPath);
      const res = await fetch(p.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p.body),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "falha na transcrição");
      setTranscript(data.text ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
    } finally {
      setLoading(false);
    }
  }

  if (transcript) {
    return (
      <div className="reveal mt-2 rounded-control border border-line bg-bg/60 p-2.5 text-sm text-fg/90">
        <div className="mono mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-faint">
          <span className="h-1 w-1 rounded-full bg-accent" /> transcrição
        </div>
        <p className="whitespace-pre-wrap leading-relaxed">{transcript}</p>
      </div>
    );
  }

  if (loading) {
    return <ScanShimmer lines={2} className="mt-2 w-full max-w-sm" />;
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={run}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
        Transcrever
      </Button>
      {error && <span className="mono text-xs text-danger">{error}</span>}
    </div>
  );
}

