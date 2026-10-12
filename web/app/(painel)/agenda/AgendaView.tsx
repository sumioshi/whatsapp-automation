"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, CabecalhoPagina, IconButton, Spinner } from "@/app/components/ui";
import {
  type ChatDaAgenda,
  type Rascunho,
  diaBrt,
  diasDaSemana,
  eventoEmFoco,
  inicioDaSemana,
  janelaDaSemana,
  numeroDaSemana,
  rascunhoDoEvento,
  rascunhoNovo,
  rotuloDaSemana,
  rotuloDoMes,
  somarDias,
} from "@/lib/agenda-semana";
import type { EstadoAgenda, Evento } from "@/lib/google/evento";
import { ConectarGoogle } from "./ConectarGoogle";
import { EventoModal } from "./EventoModal";
import { IcAnterior, IcMais, IcPainel, IcProximo } from "./icones";
import { PainelAgenda } from "./PainelAgenda";
import { SemanaGrade, chaveDoEvento } from "./SemanaGrade";

const OCULTAS_KEY = "wac-agenda-ocultas";
/** No celular, alvo de toque de 40 px. */
const TOQUE = "max-[860px]:h-10";
const TOQUE_ICONE = "max-[860px]:h-10 max-[860px]:w-10";
const AVISOS: Record<string, string> = {
  conexao: "Não deu para conectar com o Google. Tente de novo.",
  permissao: "Faltou autorizar a agenda na tela do Google. Conecte de novo e deixe as caixas marcadas.",
  nao_configurado: "Faltam as credenciais do Google no servidor.",
  google_indisponivel: "O Google Agenda não respondeu. Tente de novo em instantes.",
};

/** O que está acontecendo ou o próximo evento, para o painel abrir sozinho. */
function chaveEmFoco(lista: Evento[]): string | null {
  const foco = eventoEmFoco(lista, Date.now());
  return foco ? chaveDoEvento(foco) : null;
}

function lerOcultas(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(OCULTAS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function AgendaView({ inicial, aviso }: { inicial: EstadoAgenda; aviso: string | null }) {
  const [estado, setEstado] = useState(inicial);
  const desconectou = useCallback(
    () => setEstado((e) => ({ ...e, conectado: false, email: null, agendas: [] })),
    [],
  );
  const texto = aviso ? (AVISOS[aviso] ?? null) : null;
  if (!estado.configurado || !estado.conectado) {
    return <ConectarGoogle configurado={estado.configurado} aviso={texto} />;
  }
  return <AgendaConectada estado={estado} aviso={texto} aoDesconectar={desconectou} aoAtualizar={setEstado} />;
}

function AgendaConectada({
  estado,
  aviso: avisoInicial,
  aoDesconectar,
  aoAtualizar,
}: {
  estado: EstadoAgenda;
  aviso: string | null;
  aoDesconectar: () => void;
  aoAtualizar: (e: EstadoAgenda) => void;
}) {
  const [segunda, setSegunda] = useState(() => inicioDaSemana(diaBrt(Date.now())));
  const [eventos, setEventos] = useState<Evento[]>([]);
  // null até ler a escolha salva: a primeira busca já respeita as agendas desligadas.
  const [ocultas, setOcultas] = useState<string[] | null>(null);
  const [aviso, setAviso] = useState(avisoInicial);
  const [carregando, setCarregando] = useState(true);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [gaveta, setGaveta] = useState(false);
  const [chats, setChats] = useState<ChatDaAgenda[]>([]);
  // Só a resposta do pedido mais recente vale: trocar de semana rápido não mistura dados.
  const pedido = useRef(0);

  useEffect(() => setOcultas(lerOcultas()), []);
  // Nomes dos chats, para o evento achar a conversa do cliente de que trata.
  useEffect(() => {
    let vivo = true;
    fetch("/api/groups/summary", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: Array<{ slug?: unknown; name?: unknown }>) => {
        if (!vivo || !Array.isArray(lista)) return;
        setChats(
          lista
            .filter((g) => typeof g.slug === "string" && typeof g.name === "string")
            .map((g) => ({ slug: g.slug as string, nome: g.name as string })),
        );
      })
      .catch(() => {
        // Sem a lista, o painel só não mostra o atalho para a conversa.
      });
    return () => {
      vivo = false;
    };
  }, []);

  const dias = useMemo(() => diasDaSemana(segunda), [segunda]);
  const visiveis = estado.agendas
    .filter((a) => !ocultas?.includes(a.id))
    .map((a) => a.id)
    .join(",");
  const semAgendas = estado.agendas.length === 0;
  const principal = estado.agendas.find((a) => a.principal && a.gravavel) ?? estado.agendas.find((a) => a.gravavel);
  const hoje = diaBrt(Date.now());
  const evento = eventos.find((e) => chaveDoEvento(e) === selecionado) ?? null;

  const carregar = useCallback(async () => {
    if (ocultas === null) return;
    const meu = ++pedido.current;
    // A página abriu com o Google fora do ar: tenta de novo a lista de agendas.
    if (semAgendas) {
      try {
        const res = await fetch("/api/agenda/estado", { cache: "no-store" });
        const novo = (await res.json().catch(() => ({}))) as Partial<EstadoAgenda>;
        if (meu !== pedido.current) return;
        if (res.ok && novo.conectado === false) aoDesconectar();
        else if (res.ok && Array.isArray(novo.agendas) && novo.agendas.length) aoAtualizar(novo as EstadoAgenda);
      } catch {
        // Continua com o aviso atual; a próxima tentativa vem no ciclo de 60 s.
      }
      setCarregando(false);
      return;
    }
    if (!visiveis) {
      setEventos([]);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    try {
      const q = new URLSearchParams({ ...janelaDaSemana(segunda), agendas: visiveis });
      const res = await fetch(`/api/agenda/eventos?${q}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as Evento[] | { error?: string; codigo?: string };
      if (meu !== pedido.current) return;
      if (!res.ok || !Array.isArray(data)) {
        const falha = data as { error?: string; codigo?: string };
        if (falha.codigo === "desconectado") {
          aoDesconectar();
          return;
        }
        setAviso(falha.error ?? "falha ao carregar a agenda");
        return;
      }
      setEventos(data);
      // Sem escolha (ou a escolhida sumiu), o painel abre o que está acontecendo ou o próximo.
      setSelecionado((atual) => (atual && data.some((e) => chaveDoEvento(e) === atual) ? atual : chaveEmFoco(data)));
      setAviso(null);
    } catch {
      if (meu === pedido.current) setAviso("sem conexão com o painel");
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, [segunda, visiveis, ocultas, semAgendas, aoDesconectar, aoAtualizar]);

  useEffect(() => {
    void carregar();
    const t = window.setInterval(() => void carregar(), 60_000);
    const voltou = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    document.addEventListener("visibilitychange", voltou);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", voltou);
    };
  }, [carregar]);

  // Esc fecha a gaveta do painel (tela estreita); o modal cuida do próprio Esc.
  useEffect(() => {
    if (!gaveta || rascunho) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGaveta(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [gaveta, rascunho]);

  function irPara(nova: string) {
    setSegunda(nova);
    setSelecionado(null);
  }

  function alternar(id: string) {
    setOcultas((anterior) => {
      const atual = anterior ?? [];
      const nova = atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id];
      try {
        localStorage.setItem(OCULTAS_KEY, JSON.stringify(nova));
      } catch {
        // Sem armazenamento local, a escolha vale só até recarregar.
      }
      return nova;
    });
  }

  async function desconectar() {
    await fetch("/api/google/desconectar", { method: "POST" }).catch(() => undefined);
    aoDesconectar();
  }

  const semana = numeroDaSemana(segunda);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CabecalhoPagina
        variante="barra"
        titulo={rotuloDoMes(dias)}
        subtitulo={
          <span className="inline-flex items-center gap-2">
            <span
              title={`Semana ${semana}: ${rotuloDaSemana(dias)}`}
              className="inline-flex h-[22px] items-center rounded-tag bg-elevated px-2 font-mono text-[12px] font-medium tabular-nums text-fg-dim"
            >
              S{semana}
            </span>
            {carregando && <Spinner className="text-fg-faint" />}
          </span>
        }
        acoes={
          <>
            <IconButton size="sm" aria-label="Semana anterior" className={TOQUE_ICONE} onClick={() => irPara(somarDias(segunda, -7))}>
              <IcAnterior />
            </IconButton>
            <Button variant="subtle" size="sm" className={TOQUE} onClick={() => irPara(inicioDaSemana(diaBrt(Date.now())))}>
              Hoje
            </Button>
            <IconButton size="sm" aria-label="Próxima semana" className={TOQUE_ICONE} onClick={() => irPara(somarDias(segunda, 7))}>
              <IcProximo />
            </IconButton>
            <IconButton
              size="sm"
              aria-label="Agendas e evento selecionado"
              aria-expanded={gaveta}
              className={`hidden max-[1180px]:grid ${TOQUE_ICONE}`}
              onClick={() => setGaveta(true)}
            >
              <IcPainel />
            </IconButton>
            <Button
              size="sm"
              className={TOQUE}
              disabled={!principal}
              title={principal ? undefined : "Nenhuma agenda aceita evento novo"}
              onClick={() => principal && setRascunho(rascunhoNovo(dias.includes(hoje) ? hoje : segunda, 9 * 60, principal.id))}
            >
              <IcMais className="h-3.5 w-3.5" />
              Evento
            </Button>
          </>
        }
      />
      {aviso && (
        <p role="alert" className="border-b border-line bg-danger-bg px-8 py-2 text-[13px] text-danger max-[860px]:px-4">
          {aviso}
        </p>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_328px] max-[1180px]:grid-cols-1">
        <SemanaGrade
          dias={dias}
          eventos={eventos}
          hoje={hoje}
          selecionado={selecionado}
          aoClicarHorario={(dia, minuto) => principal && setRascunho(rascunhoNovo(dia, minuto, principal.id))}
          aoClicarEvento={(ev) => {
            setSelecionado(chaveDoEvento(ev));
            if (window.matchMedia("(max-width: 1180px)").matches) setGaveta(true);
          }}
        />
        <PainelAgenda
          agendas={estado.agendas}
          ocultas={ocultas ?? []}
          aoAlternarAgenda={alternar}
          evento={evento}
          chats={chats}
          email={estado.email}
          aoEditar={(ev) => setRascunho(rascunhoDoEvento(ev))}
          aoApagado={() => {
            setSelecionado(null);
            void carregar();
          }}
          aoRecarregar={() => void carregar()}
          aoDesconectar={() => void desconectar()}
          gavetaAberta={gaveta}
          aoFecharGaveta={() => setGaveta(false)}
        />
      </div>
      {rascunho && (
        <EventoModal
          rascunho={rascunho}
          agendas={estado.agendas}
          aoFechar={() => setRascunho(null)}
          aoSalvar={() => {
            setRascunho(null);
            void carregar();
          }}
          aoRecarregar={() => void carregar()}
        />
      )}
    </div>
  );
}
