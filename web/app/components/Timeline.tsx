"use client";

import { useRouter } from "next/navigation";
import { checarSessao, useRotas } from "./RotasPainel";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MessageView, PollView } from "@/lib/data";
import { LiveAudio } from "./LiveAudio";
import { PresenceLine } from "./PresenceLine";
import { Button, cn, IconButton, NumberTicker, ScanShimmer } from "./ui";
import { Bubble } from "./chat/Bubble";
import { Composer } from "./chat/Composer";
import { SuggestionCard } from "./chat/SuggestionCard";
import { type Contacts, formatTime, numberFromJid } from "./chat/format";


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
    <div className="relative inline-grid auto-cols-fr grid-flow-col rounded-control border border-line bg-surface-2 p-0.5">
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
  total,
  draft,
  onUseDraft,
}: {
  slug: string;
  groupName: string;
  messages: MessageView[];
  /** Total real do chat — a lista inicial é só a janela final (paginada). */
  total?: number;
  /** Rascunho do copiloto pra injetar no composer (elevado pelo GroupWorkspace). */
  draft?: { text: string; nonce: number } | null;
  /** Cola um texto no composer (ponte draft→composer). Usado pelo card de sugestão. */
  onUseDraft?: (text: string) => void;
}) {
  const [messages, setMessages] = useState<MessageView[]>(initial);
  const [totalCount, setTotalCount] = useState(total ?? initial.length);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Há mais histórico acima? (some quando uma paginação volta vazia/incompleta)
  const [hasMore, setHasMore] = useState((total ?? initial.length) > initial.length);
  const [teamIds, setTeamIds] = useState<Set<string>>(new Set());
  const [copilotOn, setCopilotOn] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [mediaFilter, setMediaFilter] = useState("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const rotas = useRotas();

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

  // Pagina o histórico pra cima (estilo WhatsApp), preservando a posição do scroll.
  const loadOlder = useCallback(async () => {
    const first = messages[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = checarSessao(
        await fetch(rotas.mensagens(slug, { before: first.id, limit: 150 }), { cache: "no-store" }),
        rotas,
      );
      if (!res.ok) return;
      const older = (await res.json()) as MessageView[];
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      const el = scrollRef.current;
      const prevHeight = el?.scrollHeight ?? 0;
      setMessages((cur) => [...older, ...cur]);
      if (older.length < 150) setHasMore(false);
      // Reancora o scroll depois que o React pintar o bloco novo acima.
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - prevHeight;
      });
    } catch {
      /* rede/reinício — tenta de novo no próximo clique */
    } finally {
      setLoadingOlder(false);
    }
  }, [messages, slug, loadingOlder, rotas]);
  // Ids do carregamento inicial — só anima a entrada do que chegar DEPOIS (estado),
  // sem orquestrar a página inteira no primeiro load.
  const initialIds = useRef(new Set(initial.map((m) => m.id)));

  // Carrega quem é do time (pra marcar "time" e separar de cliente).
  useEffect(() => {
    if (!rotas.recursos.time) return;
    fetch("/api/team", { cache: "no-store" })
      .then((r) => r.json())
      .then((cs: Array<{ id: string; role: string }>) =>
        setTeamIds(new Set(cs.filter((c) => c.role === "team").map((c) => c.id))),
      )
      .catch(() => {});
  }, [rotas]);

  // Opt-in do copiloto neste grupo: sem ele, nenhum card de sugestão é montado/disparado.
  useEffect(() => {
    let alive = true;
    setCopilotOn(false);
    if (!rotas.recursos.copiloto) return;
    fetch("/api/triage", { cache: "no-store" })
      .then((r) => r.json())
      .then((t: { copilot?: Record<string, boolean> }) => {
        if (alive) setCopilotOn(Boolean(t.copilot?.[slug]));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug, rotas]);

  // Marca o grupo como visto ao abrir e atualiza a sidebar (zera as não-lidas).
  useEffect(() => {
    const v = rotas.visto(slug, new Date().toISOString());
    fetch(v.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v.body),
    })
      .then((r) => {
        checarSessao(r, rotas);
        router.refresh();
      })
      .catch(() => {});
  }, [slug, router, rotas]);

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
      const res = checarSessao(await fetch(rotas.mensagens(slug), { cache: "no-store" }), rotas);
      if (!res.ok) return;
      const body = await res.text();
      if (body === lastBodyRef.current) return; // nada mudou → não mexe no estado
      lastBodyRef.current = body;
      const tail = JSON.parse(body) as MessageView[];
      // Merge: preserva o histórico paginado acima e troca só a cauda (o que
      // veio agora, por id). Edições/reações fora da janela atualizam no F5.
      setMessages((cur) => {
        const ids = new Set(tail.map((m) => m.id));
        const kept = cur.filter((m) => !ids.has(m.id));
        const firstTailTs = tail[0]?.timestamp ?? "";
        // Mantém só o que é ANTERIOR à janela (o resto é cauda velha → sai).
        const older = kept.filter((m) => m.timestamp <= firstTailTs);
        const next = [...older, ...tail];
        setTotalCount((t) => Math.max(t, next.length));
        return next;
      });
    } catch {
      /* coletor/painel pode estar reiniciando */
    }
  }, [slug, rotas]);

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
            else window.location.assign(rotas.inicio);
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
                <NumberTicker value={totalCount} />
                {totalCount === 1 ? "mensagem" : "mensagens"}
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
          className="flex-1 space-y-2.5 overflow-y-auto px-4 py-6 md:px-10"
        >
          {hasMore && mediaFilter === "all" && shown.length > 0 && (
            <div className="flex justify-center pb-2">
              <Button variant="ghost" size="sm" onClick={loadOlder} disabled={loadingOlder}>
                {loadingOlder
                  ? "Carregando…"
                  : `Carregar anteriores (${Math.max(0, totalCount - messages.length)} acima)`}
              </Button>
            </div>
          )}
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
            className="pop-in absolute right-5 bottom-4 grid h-10 w-10 place-items-center rounded-full border border-line bg-elevated text-fg-dim [box-shadow:var(--shadow-pop)] transition-colors hover:text-fg"
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

      <Composer slug={slug} groupJid={messages.at(-1)?.groupJid ?? null} onSent={poll} draft={draft} />
    </>
  );
}

/** Deriva o 'kind' do coletor a partir do MIME do arquivo escolhido. */
