"use client";

import { useRouter } from "next/navigation";
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AvisoEntrega,
  autoria,
  type BalaoDaIa,
  chaveDia,
  continuaSequencia,
  type EventoEntrega,
  ligarEntregas,
  rotuloDia,
  rotuloDosBaloes,
} from "@/lib/caixa";
import type { MessageView } from "@/lib/data";
import { instanteLongo } from "@/lib/formatar-data";
import { Icone } from "./caixa/icones";
import { Bubble } from "./chat/Bubble";
import { Composer } from "./chat/Composer";
import { type Contacts, numberFromJid } from "./chat/format";
import { liberarSugestao, SuggestionCard } from "./chat/SuggestionCard";
import { PresenceLine } from "./PresenceLine";
import { checarSessao, useRotas } from "./RotasPainel";
import { Avatar, Button, IconButton, Segmentado, cn } from "./ui";

function SeparadorDia({ iso, agora }: { iso: string; agora: number }) {
  return (
    <div className="mb-1 mt-6 flex items-center gap-3 font-mono text-[11px] font-medium leading-none text-fg-faint before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
      {rotuloDia(iso, agora)}
    </div>
  );
}

/** Aviso da fila de envio (entrega interrompida ou cancelada), como linha de sistema. */
function AvisoLine({ aviso }: { aviso: AvisoEntrega }) {
  return (
    <div
      className="mt-4 inline-flex max-w-full items-center gap-2 self-center rounded-full border border-line bg-surface px-3 py-1.5 text-center text-[12.5px] text-fg-dim"
      title={instanteLongo(aviso.ts)}
    >
      <Icone nome="alerta" tamanho={14} className="shrink-0 text-warn" />
      {aviso.texto}
    </div>
  );
}

/** Chamada vira uma linha de sistema no meio da conversa, não um balão. */
function CallLine({ m }: { m: MessageView }) {
  const call = m.call;
  if (!call) return null;
  const kind = call.isVideo ? "Chamada de vídeo" : "Chamada de voz";
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
    <div
      className="mt-4 inline-flex items-center gap-2 self-center rounded-full border border-line bg-surface px-3 py-1.5 text-center text-[12.5px] text-fg-dim"
      title={instanteLongo(m.timestamp)}
    >
      <Icone nome={call.isVideo ? "video" : "telefone"} tamanho={14} className={missed ? "text-danger" : "text-fg-faint"} />
      {kind}
      {who} {outcome}
    </div>
  );
}

// Tempo que a MINHA última mensagem precisa ficar sem resposta para sugerir acompanhamento.
// (Espelha COPILOT_FOLLOWUP_AFTER_MIN do servidor; a rota revalida.)
const FOLLOWUP_AFTER_MS = 60 * 60_000;

const ROTULO_TIPO: Record<string, string> = {
  audio: "Áudio",
  image: "Imagem",
  video: "Vídeo",
  gif: "GIF",
  document: "Documento",
  sticker: "Figurinha",
};

export interface CabecalhoConversa {
  avatarPath: string | null;
  tipo: "grupo" | "dm";
  /** Quantas pessoas (fora a própria conta) escreveram na conversa. */
  pessoas: number;
  /** Ações à direita: modo de envio, silenciar, resolver, painel. */
  acoes?: ReactNode;
}

export function Timeline({
  slug,
  groupName,
  messages: initial,
  total,
  agoraInicial,
  donoLogin = null,
  cabecalho,
  draft,
  onAbrirCopiloto,
}: {
  slug: string;
  groupName: string;
  messages: MessageView[];
  /** Total real do chat (a lista inicial é só a janela final, paginada). */
  total?: number;
  /** Relógio do servidor, para "hoje"/"ontem" saírem iguais no servidor e no navegador. */
  agoraInicial: number;
  /** Login do dono no painel: separa "você pelo painel" de alguém da equipe. */
  donoLogin?: string | null;
  cabecalho: CabecalhoConversa;
  /** Rascunho do copiloto do painel para o compositor. */
  draft?: { text: string; nonce: number } | null;
  /** O botão da IA no compositor abre o copiloto quando ele está desligado neste chat. */
  onAbrirCopiloto?: () => void;
}) {
  const [messages, setMessages] = useState<MessageView[]>(initial);
  const [totalCount, setTotalCount] = useState(total ?? initial.length);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Há mais histórico acima? (some quando uma paginação volta vazia ou incompleta)
  const [hasMore, setHasMore] = useState((total ?? initial.length) > initial.length);
  const [teamIds, setTeamIds] = useState<Set<string>>(new Set());
  const [copilotOn, setCopilotOn] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [mediaFilter, setMediaFilter] = useState("all");
  const [filtroAberto, setFiltroAberto] = useState(false);
  // Pedido explícito de rascunho (botão da IA): vale para a mensagem que era a última no clique.
  const [pedidoRascunho, setPedidoRascunho] = useState<{ id: string; n: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const rotas = useRotas();

  const filterOptions = useMemo(() => {
    const order = ["audio", "image", "video", "gif", "document", "sticker"] as const;
    const present = new Set(messages.map((m) => m.type));
    return [{ valor: "all", rotulo: "Tudo" }, ...order.filter((t) => present.has(t)).map((t) => ({ valor: t, rotulo: ROTULO_TIPO[t] ?? t }))];
  }, [messages]);

  const shown = useMemo(
    () => (mediaFilter === "all" ? messages : messages.filter((m) => m.type === mediaFilter)),
    [messages, mediaFilter],
  );

  // Preso ao fim: enquanto a pessoa não sobe, o que cresce (imagem, áudio, mensagem nova) mantém o fim à vista.
  // Só um gesto da pessoa (roda, toque, tecla) solta o fim; a rolagem que o próprio
  // conteúdo provoca ao crescer não conta.
  const presoNoFim = useRef(true);
  const ultimoGesto = useRef(0);
  const conteudoRef = useRef<HTMLDivElement>(null);
  const marcarGesto = useCallback(() => {
    ultimoGesto.current = Date.now();
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distancia = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distancia < 200) presoNoFim.current = true;
    else if (Date.now() - ultimoGesto.current < 1500) presoNoFim.current = false;
    setShowJump(distancia > 400);
  }, []);

  const jumpToBottom = useCallback(() => {
    presoNoFim.current = true;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  // Pagina o histórico para cima (como no WhatsApp), preservando a posição.
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
      // Reancora a rolagem depois que o bloco novo pintar acima.
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - prevHeight;
      });
    } catch {
      /* rede ou reinício: tenta de novo no próximo clique */
    } finally {
      setLoadingOlder(false);
    }
  }, [messages, slug, loadingOlder, rotas]);

  // Ids do carregamento inicial: só anima a entrada do que chegar depois.
  const initialIds = useRef(new Set(initial.map((m) => m.id)));

  // Quem é do time (para marcar e separar de cliente).
  useEffect(() => {
    if (!rotas.recursos.time) return;
    fetch("/api/team", { cache: "no-store" })
      .then((r) => r.json())
      .then((cs: Array<{ id: string; role: string }>) =>
        setTeamIds(new Set(cs.filter((c) => c.role === "team").map((c) => c.id))),
      )
      .catch(() => {});
  }, [rotas]);

  // Copiloto ligado neste chat: sem ele, nenhum rascunho é pedido.
  useEffect(() => {
    let alive = true;
    setCopilotOn(false);
    if (!rotas.recursos.copiloto) return;
    const ler = () =>
      fetch("/api/triage", { cache: "no-store" })
        .then((r) => r.json())
        .then((t: { copilot?: Record<string, boolean> }) => {
          if (alive) setCopilotOn(Boolean(t.copilot?.[slug]));
        })
        .catch(() => {});
    void ler();
    // O painel do cliente liga e desliga o copiloto: acompanha sem recarregar.
    window.addEventListener("copiloto:mudou", ler);
    return () => {
      alive = false;
      window.removeEventListener("copiloto:mudou", ler);
    };
  }, [slug, rotas]);

  // Marca a conversa como vista ao abrir e atualiza a fila (zera as não lidas).
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

  // Mapa de id → nome (de quem já mandou mensagem) e os ids que são "você".
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

  // Entregas da IA nesta conversa (só no painel do dono): numeram os balões e avisam o que não saiu.
  const [eventos, setEventos] = useState<EventoEntrega[]>([]);
  const primeiraTs = messages[0]?.timestamp ?? "";
  useEffect(() => {
    if (rotas.modo !== "dono") return;
    let vivo = true;
    // Uma hora antes da primeira mensagem carregada: pega a entrega que começou um pouco antes.
    const desde = primeiraTs ? new Date(Date.parse(primeiraTs) - 3_600_000).toISOString() : "";
    const ler = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/entregas/historico?slug=${encodeURIComponent(slug)}&desde=${encodeURIComponent(desde)}`, { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as { eventos?: EventoEntrega[] };
        if (vivo) setEventos(d.eventos ?? []);
      } catch {
        /* painel reiniciando: fica o que já havia */
      }
    };
    void ler();
    const id = setInterval(ler, 10_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [slug, rotas, primeiraTs]);

  // Relógio da tela: começa no do servidor (sem diferença na hidratação) e anda a cada minuto,
  // para "hoje"/"ontem" virarem e o acompanhamento amadurecer sem recarregar.
  const [agora, setAgora] = useState(agoraInicial);
  useEffect(() => {
    setAgora(Date.now());
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Alvo do rascunho automático (um por turno; mensagem antiga nunca dispara):
  //  - última mensagem RECEBIDA → sugerir resposta;
  //  - última mensagem MINHA parada há FOLLOWUP_AFTER_MS ou mais → sugerir acompanhamento.
  // O botão da IA pede de novo para a última mensagem, mesmo fora dessas regras.
  const suggest = useMemo<{ id: string; followup: boolean } | null>(() => {
    if (!copilotOn) return null;
    const last = messages[messages.length - 1];
    if (!last) return null;
    if (pedidoRascunho?.id === last.id) return { id: last.id, followup: Boolean(last.fromMe) };
    if (!last.fromMe) return { id: last.id, followup: false };
    const ageMs = agora - new Date(last.timestamp).getTime();
    if (ageMs < FOLLOWUP_AFTER_MS) return null;
    return { id: last.id, followup: true };
  }, [messages, copilotOn, agora, pedidoRascunho]);

  const pedirRascunho = useCallback(() => {
    if (!copilotOn) {
      onAbrirCopiloto?.();
      return;
    }
    const last = messages[messages.length - 1];
    if (!last) return;
    liberarSugestao(last.id);
    setPedidoRascunho((p) => ({ id: last.id, n: (p?.n ?? 0) + 1 }));
  }, [copilotOn, messages, onAbrirCopiloto]);

  // Busca mensagens novas a cada 3 s (a tela atualiza sozinha). Só mexe no estado
  // quando a resposta muda de verdade: compara o corpo cru antes de parsear.
  const lastBodyRef = useRef<string>("");
  const poll = useCallback(async () => {
    try {
      const res = checarSessao(await fetch(rotas.mensagens(slug), { cache: "no-store" }), rotas);
      if (!res.ok) return;
      const body = await res.text();
      if (body === lastBodyRef.current) return;
      lastBodyRef.current = body;
      const tail = JSON.parse(body) as MessageView[];
      // Preserva o histórico paginado acima e troca só a cauda (o que veio agora, por id).
      setMessages((cur) => {
        const ids = new Set(tail.map((m) => m.id));
        const kept = cur.filter((m) => !ids.has(m.id));
        const firstTailTs = tail[0]?.timestamp ?? "";
        const older = kept.filter((m) => m.timestamp <= firstTailTs);
        const next = [...older, ...tail];
        setTotalCount((t) => Math.max(t, next.length));
        return next;
      });
    } catch {
      /* coletor ou painel reiniciando */
    }
  }, [slug, rotas]);

  useEffect(() => {
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [poll]);

  // Ao abrir ou trocar de conversa, vai direto para o fim e acompanha o que crescer depois.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rola ao abrir/trocar
  useEffect(() => {
    const el = scrollRef.current;
    const conteudo = conteudoRef.current;
    if (!el || !conteudo) return;
    presoNoFim.current = true;
    el.scrollTop = el.scrollHeight;
    // Observa o conteúdo (imagem que carrega, mensagem nova) e a própria janela
    // (o compositor cresce com o rascunho da IA e encolhe a área da conversa).
    const obs = new ResizeObserver(() => {
      if (presoNoFim.current) el.scrollTop = el.scrollHeight;
    });
    obs.observe(conteudo);
    obs.observe(el);
    return () => obs.disconnect();
  }, [slug]);

  const nomeDe = useCallback(
    (numero: string) => (cabecalho.tipo === "dm" ? groupName : (contacts.names.get(numero) ?? null)),
    [cabecalho.tipo, groupName, contacts],
  );

  const entregas = useMemo(() => ligarEntregas(messages, eventos, agora), [messages, eventos, agora]);

  // Mensagens e avisos da fila numa linha só, na ordem do tempo (os avisos só na vista completa).
  const itens = useMemo(() => {
    type Item = { tipo: "msg"; m: MessageView } | { tipo: "aviso"; a: AvisoEntrega };
    const lista: Item[] = shown.map((m) => ({ tipo: "msg", m }));
    if (mediaFilter !== "all" || entregas.avisos.length === 0 || shown.length === 0) return lista;
    const inicio = shown[0]?.timestamp ?? "";
    for (const a of entregas.avisos) if (a.ts >= inicio) lista.push({ tipo: "aviso", a });
    const ts = (i: Item) => (i.tipo === "msg" ? i.m.timestamp : i.a.ts);
    return lista.sort((x, y) => ts(x).localeCompare(ts(y)));
  }, [shown, entregas.avisos, mediaFilter]);

  // Quem continua o bloco da mensagem anterior (sem nome nem avatar) e, no começo de
  // cada bloco da IA, o rótulo da entrega ("1–3 de 3 balões").
  const blocos = useMemo(() => {
    const continua = new Set<string>();
    const rotulos: Record<string, { texto: string; ticket: string }> = {};
    let inicio: { id: string; baloes: BalaoDaIa[] } | null = null;
    const fechar = () => {
      if (inicio?.baloes.length) {
        rotulos[inicio.id] = { texto: rotuloDosBaloes(inicio.baloes), ticket: inicio.baloes[0]?.ticket ?? "" };
      }
    };
    itens.forEach((item, i) => {
      if (item.tipo !== "msg") {
        fechar();
        inicio = null;
        return;
      }
      const anterior = itens[i - 1];
      const prev = anterior?.tipo === "msg" ? anterior.m : undefined;
      const m = item.m;
      const segue = Boolean(prev) && chaveDia((prev as MessageView).timestamp) === chaveDia(m.timestamp) && continuaSequencia(prev, m, donoLogin);
      const b = entregas.baloes[m.id];
      if (segue && inicio && (!b || inicio.baloes[0]?.ticket === b.ticket || inicio.baloes.length === 0)) {
        continua.add(m.id);
        if (b && (inicio.baloes.length === 0 || inicio.baloes[0]?.ticket === b.ticket)) inicio.baloes.push(b);
        return;
      }
      if (segue && !inicio) continua.add(m.id);
      fechar();
      inicio = { id: m.id, baloes: b ? [b] : [] };
    });
    fechar();
    return { continua, rotulos };
  }, [itens, entregas.baloes, donoLogin]);

  const contagem = new Intl.NumberFormat("pt-BR").format(totalCount);
  const filtroAtivo = mediaFilter !== "all";

  return (
    <>
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-5 max-[860px]:gap-2 max-[860px]:px-3">
        <IconButton
          title="Voltar para a fila"
          aria-label="Voltar para a fila"
          onClick={() => router.push(rotas.caixa)}
          className="-ml-1 min-[861px]:hidden max-[860px]:h-10 max-[860px]:w-10"
        >
          <Icone nome="voltar" />
        </IconButton>
        <Avatar
          nome={groupName}
          tipo={cabecalho.tipo}
          fotoUrl={cabecalho.avatarPath ? rotas.midia(cabecalho.avatarPath) : null}
          tamanho="md"
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-semibold leading-tight tracking-[-0.01em] text-fg">{groupName}</h2>
          <div className="truncate text-[12.5px] text-fg-faint">
            {cabecalho.tipo === "dm"
              ? "conversa direta"
              : `grupo · ${cabecalho.pessoas} ${cabecalho.pessoas === 1 ? "pessoa" : "pessoas"}`}
            {" · "}
            <PresenceLine
              slug={slug}
              nomeDe={nomeDe}
              fallback={
                <span>
                  <span className="font-mono tabular-nums">{contagem}</span> {totalCount === 1 ? "mensagem" : "mensagens"}
                </span>
              }
            />
          </div>
        </div>
        {filterOptions.length > 1 && (
          <IconButton
            size="sm"
            title="Mostrar só um tipo de mídia"
            aria-label="Mostrar só um tipo de mídia"
            aria-pressed={filtroAberto || filtroAtivo}
            active={filtroAberto || filtroAtivo}
            onClick={() => setFiltroAberto((v) => !v)}
            className="max-[860px]:hidden"
          >
            <Icone nome="filtro" />
          </IconButton>
        )}
        {cabecalho.acoes}
      </header>

      {(filtroAberto || filtroAtivo) && filterOptions.length > 1 && (
        <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-5 py-2 max-[860px]:px-3">
          <Segmentado rotulo="Tipo de mensagem" valor={mediaFilter} aoMudar={setMediaFilter} opcoes={filterOptions} />
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          onWheel={marcarGesto}
          onTouchMove={marcarGesto}
          onKeyDown={marcarGesto}
          onPointerDown={marcarGesto}
          className="min-h-0 flex-1 overflow-y-auto bg-bg px-7 pb-7 pt-2 [overflow-anchor:none] max-[860px]:px-4 max-[860px]:pb-5 max-[860px]:pt-1"
        >
          <div ref={conteudoRef} className="mx-auto flex max-w-[720px] flex-col">
            {hasMore && mediaFilter === "all" && shown.length > 0 && (
              <div className="mt-4 flex justify-center">
                <Button variant="ghost" size="sm" onClick={loadOlder} disabled={loadingOlder}>
                  {loadingOlder ? "Carregando…" : (
                    <>
                      Carregar anteriores
                      <span className="font-mono tabular-nums text-fg-faint">{new Intl.NumberFormat("pt-BR").format(Math.max(0, totalCount - messages.length))}</span>
                    </>
                  )}
                </Button>
              </div>
            )}
            {shown.length === 0 ? (
              <p className="mt-16 text-center text-[13.5px] text-fg-faint">
                {mediaFilter === "all" ? "Nenhuma mensagem capturada ainda nesta conversa." : "Nada deste tipo nas mensagens carregadas."}
              </p>
            ) : (
              itens.map((item, i) => {
                const anterior = itens[i - 1];
                const tsAnterior = anterior ? (anterior.tipo === "msg" ? anterior.m.timestamp : anterior.a.ts) : null;
                const ts = item.tipo === "msg" ? item.m.timestamp : item.a.ts;
                const novoDia = !tsAnterior || chaveDia(tsAnterior) !== chaveDia(ts);
                if (item.tipo === "aviso") {
                  return (
                    <Fragment key={`aviso-${item.a.ticket}`}>
                      {novoDia && <SeparadorDia iso={ts} agora={agora} />}
                      <AvisoLine aviso={item.a} />
                    </Fragment>
                  );
                }
                const m = item.m;
                return (
                  <Fragment key={m.id}>
                    {novoDia && <SeparadorDia iso={m.timestamp} agora={agora} />}
                    {m.type === "call" && m.call ? (
                      <CallLine m={m} />
                    ) : (
                      <Bubble
                        slug={slug}
                        m={m}
                        contacts={contacts}
                        autoria={autoria(m, donoLogin)}
                        entrega={blocos.rotulos[m.id]}
                        continua={!novoDia && blocos.continua.has(m.id)}
                        fresh={!initialIds.current.has(m.id)}
                      />
                    )}
                  </Fragment>
                );
              })
            )}
          </div>
        </div>

        {showJump && (
          <button
            type="button"
            onClick={jumpToBottom}
            aria-label="Descer para o fim"
            className={cn(
              "pop-in absolute bottom-4 right-5 grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-fg-dim [box-shadow:var(--float)] transition-colors hover:text-fg",
            )}
          >
            <Icone nome="baixar" tamanho={18} />
          </button>
        )}
      </div>

      <Composer
        slug={slug}
        nome={groupName}
        groupJid={messages.at(-1)?.groupJid ?? null}
        onSent={poll}
        draft={draft}
        onPedirRascunho={rotas.recursos.copiloto ? pedirRascunho : undefined}
        rascunho={
          suggest
            ? (usar) => (
                <SuggestionCard
                  key={`${suggest.id}-${pedidoRascunho?.n ?? 0}`}
                  slug={slug}
                  messageId={suggest.id}
                  followup={suggest.followup}
                  onUseDraft={usar}
                />
              )
            : undefined
        }
      />
    </>
  );
}
