"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tipoPeloSlug } from "@/lib/aparencia";
import { quandoCurto } from "@/lib/caixa";
import type { GroupSummary } from "@/lib/data";
import type {
  EstadoSistemaNotificacao,
  EventoEntregaCru,
  NotificacaoItem,
} from "@/lib/notificacoes";
import { useRotas } from "./RotasPainel";
import { haQuanto } from "./tempo";
import { Avatar } from "./ui/Avatar";
import { Icone } from "./ui/Icone";

export type GroupMeta = Pick<GroupSummary, "slug" | "name" | "avatarPath" | "muted">;

type AbaFiltro = "todas" | "mensagens" | "sistema";

const CHAVE_VISTO_EM = "balcao:notificacoes:vistoEm";
const CHAVE_ALERTA_NATIVO = "balcao:notificacoes:alertaNativo";
const MAX_ITENS = 40;
const TOAST_MS = 5_000;

const TYPE_LABEL: Record<string, string> = {
  audio: "áudio",
  image: "imagem",
  video: "vídeo",
  gif: "GIF",
  document: "documento",
  sticker: "figurinha",
  location: "localização",
  contact: "contato",
  poll: "enquete",
  event: "evento",
};

function previaMensagem(r: { text?: string | null; type?: string | null }): string {
  const body = r.text?.trim() ?? "";
  if (body) return body.length > 120 ? `${body.slice(0, 117)}…` : body;
  if (r.type && r.type !== "text") return `[${TYPE_LABEL[r.type] ?? r.type}]`;
  return "[mensagem]";
}

function normalizarEstado(estado?: string | null, motivo?: string | null): EstadoSistemaNotificacao | null {
  const e = (estado ?? "").trim().toLowerCase();
  const m = (motivo ?? "").trim().toLowerCase();
  if (e === "falhou" || e === "falha" || m === "falha") return "falhou";
  if (e === "interrompida" || e === "interrompido") return "interrompida";
  if (e === "entregue") return "entregue";
  if (e === "entregando") return "entregando";
  if (e === "enfileirada" || e === "enfileirado" || e === "agendado" || e === "agendada") {
    return "enfileirada";
  }
  if (e === "cancelada" || e === "cancelado") return "cancelada";
  return null;
}

function textoEntrega(estado: EstadoSistemaNotificacao, previa?: string | null): string {
  const limpa = previa?.trim() ?? "";
  const curta = limpa.length > 90 ? `${limpa.slice(0, 87)}…` : limpa;
  switch (estado) {
    case "entregue":
      return curta ? `IA respondeu na conversa: ${curta}` : "IA respondeu na conversa";
    case "interrompida":
      return "Entrega da IA interrompida (nova mensagem ou envio manual)";
    case "enfileirada":
    case "entregando":
      return "IA preparando resposta humanizada...";
    case "falhou":
      return "Falha ao entregar resposta da IA";
    case "cancelada":
      return "Entrega da IA cancelada";
  }
}

function tempoNotificacao(iso: string): string {
  const rel = haQuanto(iso);
  if (rel && rel !== "—" && !rel.includes("dia")) return rel;
  return quandoCurto(iso, Date.now()) || rel;
}

export function Notificacoes({ groups }: { groups: GroupMeta[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const rotas = useRotas();

  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<AbaFiltro>("todas");
  const [itens, setItens] = useState<NotificacaoItem[]>([]);
  const [vistoEm, setVistoEm] = useState<string>("");
  const [alertaNativo, setAlertaNativo] = useState(false);
  const [toast, setToast] = useState<NotificacaoItem | null>(null);

  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const porSlug = useMemo(() => new Map(groups.map((g) => [g.slug, g])), [groups]);
  const porSlugRef = useRef(porSlug);
  porSlugRef.current = porSlug;

  const alertaNativoRef = useRef(alertaNativo);
  alertaNativoRef.current = alertaNativo;

  const salvarVisto = useCallback((iso: string) => {
    setVistoEm(iso);
    try {
      window.localStorage.setItem(CHAVE_VISTO_EM, iso);
    } catch {
      /* navegador sem localStorage */
    }
  }, []);

  const marcarTodasComoLidas = useCallback(() => {
    const maisRecente = itens[0]?.timestamp;
    const agoraIso = new Date().toISOString();
    const novoVisto = maisRecente && maisRecente > agoraIso ? maisRecente : agoraIso;
    salvarVisto(novoVisto);
  }, [itens, salvarVisto]);

  useEffect(() => {
    try {
      const salvoVisto = window.localStorage.getItem(CHAVE_VISTO_EM);
      if (salvoVisto) setVistoEm(salvoVisto);
      const salvoAlerta = window.localStorage.getItem(CHAVE_ALERTA_NATIVO);
      if (salvoAlerta === "1" && typeof Notification !== "undefined" && Notification.permission === "granted") {
        setAlertaNativo(true);
      }
    } catch {
      /* ignora */
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const dispararAlertaNavegador = useCallback(
    (item: NotificacaoItem) => {
      if (!alertaNativoRef.current) return;
      if (typeof window === "undefined" || typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;
      try {
        const titulo =
          item.tipo === "mensagem"
            ? `${item.chatNome}${item.remetente && item.remetente !== item.chatNome ? ` · ${item.remetente}` : ""}`
            : `${item.chatNome} · Sistema`;
        const n = new Notification(titulo, {
          body: item.texto,
          tag: `balcao-${item.slug}`,
        });
        n.onclick = () => {
          window.focus();
          router.push(rotas.chat(item.slug));
          n.close();
        };
      } catch {
        /* Notification bloqueada pelo contexto */
      }
    },
    [rotas, router],
  );

  const chatEstaAberto = useCallback(
    (slug: string): boolean => {
      const atual = pathnameRef.current || "";
      if (atual === rotas.chat(slug) || atual === `/g/${slug}`) return true;
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("chat") === slug) return true;
      }
      return false;
    },
    [rotas],
  );

  useEffect(() => {
    let cancelado = false;
    fetch("/api/notificacoes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((dados: { itens?: NotificacaoItem[] } | null) => {
        if (cancelado || !dados || !Array.isArray(dados.itens)) return;
        setItens((atuais) => {
          const porId = new Map<string, NotificacaoItem>();
          for (const it of [...atuais, ...dados.itens!]) {
            if (!porId.has(it.id)) porId.set(it.id, it);
          }
          return [...porId.values()]
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
            .slice(0, MAX_ITENS);
        });
      })
      .catch(() => {});

    if (typeof EventSource === "undefined") return () => {};
    const es = new EventSource("/api/events?todos=1&ocultar=coletor");

    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as {
          id?: string;
          slug?: string;
          group?: string;
          senderName?: string;
          fromMe?: boolean;
          origem?: string;
          ator?: string;
          type?: string;
          text?: string;
          timestamp?: string;
        };
        const slug = msg.slug?.trim();
        if (!slug) return;
        const meta = porSlugRef.current.get(slug);
        if (meta?.muted) return;
        const chatNome = meta?.name || msg.group?.trim() || slug;
        const timestamp = msg.timestamp || new Date().toISOString();

        if (!msg.fromMe) {
          const novo: NotificacaoItem = {
            id: msg.id || `msg:${slug}:${timestamp}`,
            tipo: "mensagem",
            slug,
            chatNome,
            remetente: msg.senderName?.trim() || chatNome,
            texto: previaMensagem(msg),
            timestamp,
          };
          setItens((atuais) => {
            const filtrados = atuais.filter((i) => i.id !== novo.id);
            return [novo, ...filtrados].slice(0, MAX_ITENS);
          });
          if (!chatEstaAberto(slug)) {
            setToast(novo);
            dispararAlertaNavegador(novo);
          }
        } else if (msg.origem === "ia_meta" || msg.origem === "ia") {
          const novo: NotificacaoItem = {
            id: `ia:${msg.id || `${slug}:${timestamp}`}`,
            tipo: "sistema",
            slug,
            chatNome,
            remetente: "IA",
            texto: textoEntrega("entregue", msg.text),
            timestamp,
            estado: "entregue",
          };
          setItens((atuais) => {
            const filtrados = atuais.filter((i) => i.id !== novo.id);
            return [novo, ...filtrados].slice(0, MAX_ITENS);
          });
        }
      } catch {
        /* ignora frame malformado */
      }
    };

    const onEntrega = (ev: Event) => {
      try {
        const raw = JSON.parse((ev as MessageEvent).data) as EventoEntregaCru;
        const slug = raw.slug?.trim();
        if (!slug) return;
        const meta = porSlugRef.current.get(slug);
        if (meta?.muted) return;
        const estado = normalizarEstado(raw.estado, raw.motivo);
        if (!estado) return;
        const chatNome = meta?.name || raw.chatNome?.trim() || slug;
        const timestamp = raw.ts?.trim() || raw.timestamp?.trim() || new Date().toISOString();
        const previa =
          raw.texto?.trim() ||
          raw.previa?.trim() ||
          (Array.isArray(raw.baloes) ? raw.baloes.join(" ") : "");
        const ticketId = raw.ticket?.trim() || raw.id?.trim() || `${slug}:${timestamp}:${estado}`;
        const novo: NotificacaoItem = {
          id: `entrega:${ticketId}`,
          tipo: "sistema",
          slug,
          chatNome,
          remetente: "IA",
          texto: textoEntrega(estado, previa),
          timestamp,
          estado,
        };
        setItens((atuais) => {
          const filtrados = atuais.filter((i) => i.id !== novo.id);
          return [novo, ...filtrados].slice(0, MAX_ITENS);
        });
        if (
          estado === "entregue" ||
          estado === "interrompida" ||
          estado === "falhou" ||
          estado === "entregando"
        ) {
          setToast(novo);
          if (estado === "interrompida" || estado === "falhou") {
            dispararAlertaNavegador(novo);
          }
        }
      } catch {
        /* ignora */
      }
    };

    es.addEventListener("entrega", onEntrega);
    return () => {
      cancelado = true;
      es.removeEventListener("entrega", onEntrega);
      es.close();
    };
  }, [chatEstaAberto, dispararAlertaNavegador]);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setAberto(false);
        gatilhoRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (gatilhoRef.current?.contains(alvo)) return;
      if (painelRef.current && !painelRef.current.contains(alvo)) {
        setAberto(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [aberto]);

  const naoLidas = useMemo(
    () => itens.filter((i) => !vistoEm || i.timestamp > vistoEm).length,
    [itens, vistoEm],
  );

  const itensFiltrados = useMemo(() => {
    if (aba === "mensagens") return itens.filter((i) => i.tipo === "mensagem");
    if (aba === "sistema") return itens.filter((i) => i.tipo === "sistema");
    return itens;
  }, [aba, itens]);

  const alternarPainel = useCallback(() => {
    setAberto((atual) => {
      const proximo = !atual;
      if (proximo) {
        const maisRecente = itens[0]?.timestamp;
        const agoraIso = new Date().toISOString();
        salvarVisto(maisRecente && maisRecente > agoraIso ? maisRecente : agoraIso);
      }
      return proximo;
    });
  }, [itens, salvarVisto]);

  const alternarAlertaNativo = useCallback(async () => {
    if (alertaNativo) {
      setAlertaNativo(false);
      try {
        window.localStorage.setItem(CHAVE_ALERTA_NATIVO, "0");
      } catch {
        /* ignora */
      }
      return;
    }
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    try {
      const perm =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      const ativo = perm === "granted";
      setAlertaNativo(ativo);
      window.localStorage.setItem(CHAVE_ALERTA_NATIVO, ativo ? "1" : "0");
    } catch {
      /* permissão negada ou indisponível */
    }
  }, [alertaNativo]);

  const abrirChat = useCallback(
    (slug: string) => {
      setAberto(false);
      setToast((t) => (t?.slug === slug ? null : t));
      router.push(rotas.chat(slug));
    },
    [rotas, router],
  );

  return (
    <div className="relative">
      <button
        ref={gatilhoRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        onClick={alternarPainel}
        title={naoLidas > 0 ? `Notificações (${naoLidas} novas)` : "Notificações"}
        aria-label={naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : "Notificações"}
        className={`relative grid h-[38px] w-[38px] place-items-center rounded-[9px] transition-colors ${
          aberto
            ? "bg-accent-soft text-accent"
            : "text-fg-faint hover:bg-elevated hover:text-fg"
        }`}
      >
        <Icone nome="bell" tamanho={18} />
        {naoLidas > 0 && (
          <span className="absolute -right-1 -top-0.5 min-w-[18px] rounded-full bg-danger px-[5px] text-center font-mono text-[10px] font-semibold leading-[17px] text-on-ink shadow-[0_0_0_2px_var(--color-rail)]">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div
          ref={painelRef}
          role="dialog"
          aria-label="Notificações"
          className="pop-in fixed bottom-3 left-[64px] z-50 flex max-h-[min(520px,calc(100dvh-24px))] w-[360px] flex-col overflow-hidden rounded-[12px] border border-line bg-surface [box-shadow:var(--float)] max-[860px]:inset-x-3 max-[860px]:bottom-[62px] max-[860px]:left-3 max-[860px]:w-auto"
        >
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-semibold text-fg">Notificações</span>
              {itens.length > 0 && (
                <span className="mono rounded-full bg-elevated px-1.5 py-0.5 text-[11px] text-fg-faint">
                  {itens.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={marcarTodasComoLidas}
                className="rounded-[6px] px-2 py-1 text-[11.5px] font-medium text-accent transition-colors hover:bg-accent-soft"
              >
                Ler todas
              </button>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar notificações"
                className="grid h-6 w-6 place-items-center rounded-[6px] text-fg-faint hover:bg-elevated hover:text-fg"
              >
                <Icone nome="x" tamanho={14} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-2.5 py-1.5">
            <div className="flex items-center gap-1" role="tablist" aria-label="Filtrar notificações">
              {(
                [
                  { id: "todas", rotulo: "Todas" },
                  { id: "mensagens", rotulo: "Mensagens" },
                  { id: "sistema", rotulo: "Sistema" },
                ] as const
              ).map((t) => {
                const ativa = aba === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={ativa}
                    onClick={() => setAba(t.id)}
                    className={`rounded-[6px] px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                      ativa
                        ? "bg-surface text-fg shadow-xs"
                        : "text-fg-faint hover:text-fg"
                    }`}
                  >
                    {t.rotulo}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={alertaNativo}
              onClick={alternarAlertaNativo}
              title="Disparar notificação nativa do Mac/navegador quando chegar mensagem nova"
              className={`flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-medium transition-colors ${
                alertaNativo
                  ? "bg-accent-soft text-accent"
                  : "text-fg-faint hover:bg-elevated hover:text-fg"
              }`}
            >
              <Icone nome="bell" tamanho={12} />
              <span>Alerta no Mac</span>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-line">
            {itensFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
                <Icone nome="bell" tamanho={20} className="text-fg-mute" />
                <p className="text-[12.5px] text-fg-faint">Nenhuma notificação recente</p>
              </div>
            ) : (
              itensFiltrados.map((item) => {
                const meta = porSlug.get(item.slug);
                const alertaCritico =
                  item.estado === "interrompida" || item.estado === "falhou";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => abrirChat(item.slug)}
                    className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
                  >
                    {item.tipo === "mensagem" ? (
                      <Avatar
                        nome={item.chatNome}
                        tipo={tipoPeloSlug(item.slug)}
                        fotoUrl={meta?.avatarPath ? rotas.midia(meta.avatarPath) : null}
                        tamanho="sm"
                        className="mt-0.5"
                      />
                    ) : (
                      <span
                        className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border ${
                          alertaCritico
                            ? "border-danger/30 bg-danger-bg text-danger"
                            : "border-accent-line bg-accent-soft text-accent"
                        }`}
                      >
                        <Icone nome={alertaCritico ? "alert" : "spark"} tamanho={14} />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[12.5px] font-medium text-fg">
                          {item.chatNome}
                        </span>
                        <span className="mono shrink-0 text-[10.5px] text-fg-faint">
                          {tempoNotificacao(item.timestamp)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.35] text-fg-dim">
                        {item.tipo === "mensagem" &&
                        item.remetente &&
                        item.remetente !== item.chatNome ? (
                          <>
                            <span className="font-medium text-fg">{item.remetente}: </span>
                            {item.texto}
                          </>
                        ) : (
                          item.texto
                        )}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pop-in fixed bottom-4 right-4 z-50 flex w-[340px] max-w-[calc(100vw-32px)] items-start gap-2.5 rounded-[12px] border border-line bg-surface p-3 [box-shadow:var(--float)] max-[860px]:bottom-[68px]"
        >
          <button
            type="button"
            onClick={() => abrirChat(toast.slug)}
            className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
          >
            {toast.tipo === "mensagem" ? (
              <Avatar
                nome={toast.chatNome}
                tipo={tipoPeloSlug(toast.slug)}
                fotoUrl={
                  porSlug.get(toast.slug)?.avatarPath
                    ? rotas.midia(porSlug.get(toast.slug)!.avatarPath!)
                    : null
                }
                tamanho="sm"
                className="mt-0.5"
              />
            ) : (
              <span
                className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border ${
                  toast.estado === "interrompida" || toast.estado === "falhou"
                    ? "border-danger/30 bg-danger-bg text-danger"
                    : "border-accent-line bg-accent-soft text-accent"
                }`}
              >
                <Icone
                  nome={
                    toast.estado === "interrompida" || toast.estado === "falhou"
                      ? "alert"
                      : "spark"
                  }
                  tamanho={14}
                />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[12.5px] font-semibold text-fg">
                  {toast.chatNome}
                </span>
                <span className="mono text-[10px] text-fg-faint">agora</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.35] text-fg-dim">
                {toast.tipo === "mensagem" &&
                toast.remetente &&
                toast.remetente !== toast.chatNome
                  ? `${toast.remetente}: ${toast.texto}`
                  : toast.texto}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Fechar alerta"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-fg-faint hover:bg-elevated hover:text-fg"
          >
            <Icone nome="x" tamanho={14} />
          </button>
        </div>
      )}
    </div>
  );
}
