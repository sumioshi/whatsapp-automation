"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Spinner } from "@/app/components/ui";
import {
  type Rascunho,
  diaBrt,
  diasDaSemana,
  inicioDaSemana,
  janelaDaSemana,
  rascunhoDoEvento,
  rascunhoNovo,
  rotuloDaSemana,
  somarDias,
} from "@/lib/agenda-semana";
import type { EstadoAgenda, Evento } from "@/lib/google/evento";
import { ConectarGoogle } from "./ConectarGoogle";
import { EventoModal } from "./EventoModal";
import { SemanaGrade } from "./SemanaGrade";

const OCULTAS_KEY = "wac-agenda-ocultas";
const AVISOS: Record<string, string> = {
  conexao: "Não deu para conectar com o Google. Tente de novo.",
  permissao: "Faltou autorizar a agenda na tela do Google. Conecte de novo e deixe as caixas marcadas.",
  nao_configurado: "Faltam as credenciais do Google no servidor.",
  google_indisponivel: "O Google Agenda não respondeu. Tente de novo em instantes.",
};

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
  return <AgendaConectada estado={estado} aviso={texto} aoDesconectar={desconectou} />;
}

function AgendaConectada({
  estado,
  aviso: avisoInicial,
  aoDesconectar,
}: {
  estado: EstadoAgenda;
  aviso: string | null;
  aoDesconectar: () => void;
}) {
  const [segunda, setSegunda] = useState(() => inicioDaSemana(diaBrt(Date.now())));
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [aviso, setAviso] = useState(avisoInicial);
  const [carregando, setCarregando] = useState(true);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  // Só a resposta do pedido mais recente vale: trocar de semana rápido não mistura dados.
  const pedido = useRef(0);

  useEffect(() => setOcultas(lerOcultas()), []);
  const dias = useMemo(() => diasDaSemana(segunda), [segunda]);
  const visiveis = estado.agendas
    .filter((a) => !ocultas.includes(a.id))
    .map((a) => a.id)
    .join(",");
  const principal = estado.agendas.find((a) => a.principal && a.gravavel) ?? estado.agendas.find((a) => a.gravavel);
  const hoje = diaBrt(Date.now());

  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
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
      setAviso(null);
    } catch {
      if (meu === pedido.current) setAviso("sem conexão com o painel");
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, [segunda, visiveis, aoDesconectar]);

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

  function alternar(id: string) {
    setOcultas((atual) => {
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

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-56 shrink-0 flex-col gap-4 border-r border-line p-4">
        <div className="min-w-0">
          <p className="text-xs text-fg-faint">Google conectado</p>
          <p className="truncate text-sm text-fg" title={estado.email ?? ""}>
            {estado.email ?? "conta Google"}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          {estado.agendas.map((a) => (
            <label
              key={a.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-fg hover:bg-surface"
            >
              <input
                type="checkbox"
                checked={!ocultas.includes(a.id)}
                onChange={() => alternar(a.id)}
                style={{ accentColor: a.cor }}
              />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.cor }} />
              <span className="truncate" title={a.nome}>
                {a.nome}
              </span>
            </label>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="mt-auto" onClick={() => void desconectar()}>
          Desconectar Google
        </Button>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line px-4 py-2">
          <Button variant="subtle" size="sm" onClick={() => setSegunda(inicioDaSemana(diaBrt(Date.now())))}>
            Hoje
          </Button>
          <Button variant="ghost" size="sm" aria-label="Semana anterior" onClick={() => setSegunda((s) => somarDias(s, -7))}>
            ‹
          </Button>
          <Button variant="ghost" size="sm" aria-label="Próxima semana" onClick={() => setSegunda((s) => somarDias(s, 7))}>
            ›
          </Button>
          <h1 className="text-sm font-medium text-fg">{rotuloDaSemana(dias)}</h1>
          {carregando && <Spinner />}
          <Button
            size="sm"
            className="ml-auto"
            disabled={!principal}
            onClick={() => principal && setRascunho(rascunhoNovo(dias.includes(hoje) ? hoje : segunda, 9 * 60, principal.id))}
          >
            Novo evento
          </Button>
        </header>
        {aviso && <p className="border-b border-line px-4 py-2 text-xs text-danger">{aviso}</p>}
        <SemanaGrade
          dias={dias}
          eventos={eventos}
          hoje={hoje}
          aoClicarHorario={(dia, minuto) => principal && setRascunho(rascunhoNovo(dia, minuto, principal.id))}
          aoClicarEvento={(ev) => setRascunho(rascunhoDoEvento(ev))}
        />
      </section>
      {rascunho && (
        <EventoModal
          rascunho={rascunho}
          agendas={estado.agendas}
          aoFechar={() => setRascunho(null)}
          aoSalvar={() => {
            setRascunho(null);
            void carregar();
          }}
        />
      )}
    </div>
  );
}
