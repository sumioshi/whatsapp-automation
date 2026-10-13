"use client";

import Link from "next/link";
import { type CSSProperties, useState } from "react";
import { useRotas } from "@/app/components/RotasPainel";
import { Badge, BotaoConfirmar, Button, Pares, cn } from "@/app/components/ui";
import { type ChatDaAgenda, conversaDoEvento, rotuloDoEvento } from "@/lib/agenda-semana";
import type { Agenda, Evento } from "@/lib/google/evento";
import { IcConversa, IcExterno, IcFechar, IcVideo } from "./icones";

const LISTA = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });

/** "Só você" ou "você, ana@x e paulo@y": o Google não lista a própria conta entre os convidados. */
function convidados(ev: Evento): string {
  return ev.convidados.length ? LISTA.format(["você", ...ev.convidados]) : "Só você";
}

/**
 * Painel à direita da semana: agendas com liga/desliga e o evento selecionado
 * (Meet, convidados, conversa do cliente, editar e apagar). Abaixo de 1180 px vira gaveta.
 */
export function PainelAgenda({
  agendas,
  ocultas,
  aoAlternarAgenda,
  evento,
  chats,
  email,
  aoEditar,
  aoApagado,
  aoRecarregar,
  aoDesconectar,
  gavetaAberta,
  aoFecharGaveta,
}: {
  agendas: Agenda[];
  ocultas: string[];
  aoAlternarAgenda: (id: string) => void;
  evento: Evento | null;
  chats: ChatDaAgenda[];
  email: string | null;
  aoEditar: (ev: Evento) => void;
  aoApagado: () => void;
  aoRecarregar: () => void;
  aoDesconectar: () => void;
  gavetaAberta: boolean;
  aoFecharGaveta: () => void;
}) {
  return (
    <>
      {gavetaAberta && (
        <button
          type="button"
          aria-label="Fechar o painel"
          onClick={aoFecharGaveta}
          className="fixed inset-0 z-30 hidden bg-scrim max-[1180px]:block"
        />
      )}
      <aside
        aria-label="Agendas e evento selecionado"
        className={cn(
          "flex min-h-0 flex-col gap-[18px] overflow-y-auto border-l border-line bg-surface-2 px-5 py-6",
          "max-[1180px]:fixed max-[1180px]:inset-y-0 max-[1180px]:right-0 max-[1180px]:z-40 max-[1180px]:w-[min(340px,92vw)] max-[1180px]:[box-shadow:var(--float)]",
          !gavetaAberta && "max-[1180px]:hidden",
        )}
      >
        <div className="hidden items-center justify-between max-[1180px]:flex">
          <span className="text-[14.5px] font-semibold text-fg">Agenda</span>
          <button
            type="button"
            onClick={aoFecharGaveta}
            aria-label="Fechar o painel"
            className="grid h-10 w-10 place-items-center rounded-control text-fg-dim hover:bg-elevated hover:text-fg"
          >
            <IcFechar />
          </button>
        </div>

        <section aria-label="Agendas" className="flex flex-wrap gap-x-3.5 gap-y-2">
          {agendas.map((a) => {
            const ligada = !ocultas.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={ligada}
                onClick={() => aoAlternarAgenda(a.id)}
                title={ligada ? `Esconder ${a.nome}` : `Mostrar ${a.nome}`}
                style={{ "--c": a.cor } as CSSProperties}
                className={cn(
                  "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-[6px] text-[12.5px] transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-accent",
                  ligada ? "text-fg-dim" : "text-fg-faint",
                )}
              >
                <span
                  aria-hidden
                  className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px] border-[1.5px] border-[var(--c)]", ligada ? "bg-[var(--c)]" : "bg-transparent")}
                />
                <span className={cn("truncate", !ligada && "line-through decoration-fg-mute")}>{a.nome}</span>
              </button>
            );
          })}
        </section>

        <div className="border-t border-line pt-[18px]">
          {evento ? (
            <DetalheDoEvento
              key={`${evento.agenda}|${evento.id}`}
              ev={evento}
              agenda={agendas.find((a) => a.id === evento.agenda)}
              chats={chats}
              aoEditar={aoEditar}
              aoApagado={aoApagado}
              aoRecarregar={aoRecarregar}
            />
          ) : (
            <p className="text-[13px] leading-relaxed text-fg-faint">
              Escolha um evento na semana para ver os detalhes, ou clique num horário vazio para marcar um.
            </p>
          )}
        </div>

        <footer className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-4 text-[12.5px] text-fg-faint">
          <span className="min-w-0 truncate">
            Google conectado{email ? <> como <span className="text-fg-dim">{email}</span></> : null}
          </span>
          <Button variant="ghost" size="sm" className="-ml-1" onClick={aoDesconectar}>
            Desconectar
          </Button>
        </footer>
      </aside>
    </>
  );
}

function DetalheDoEvento({
  ev,
  agenda,
  chats,
  aoEditar,
  aoApagado,
  aoRecarregar,
}: {
  ev: Evento;
  agenda: Agenda | undefined;
  chats: ChatDaAgenda[];
  aoEditar: (ev: Evento) => void;
  aoApagado: () => void;
  aoRecarregar: () => void;
}) {
  const rotas = useRotas();
  const [erro, setErro] = useState<string | null>(null);
  const conversa = conversaDoEvento(ev, chats);

  async function apagar() {
    setErro(null);
    try {
      const res = await fetch(`/api/agenda/eventos?${new URLSearchParams({ agenda: ev.agenda, id: ev.id })}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 404) aoRecarregar();
      if (!res.ok) throw new Error(data.error ?? "não deu para apagar");
      aoApagado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não deu para apagar");
    }
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <Badge>
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: ev.cor }} />
          {agenda?.nome ?? "Agenda"}
        </Badge>
        <h2 className="mb-1 mt-2 text-[18px] font-semibold leading-[1.3] tracking-[-0.01em] text-fg">{ev.titulo}</h2>
        <p className="font-mono text-[13px] leading-[1.4] text-fg-dim">{rotuloDoEvento(ev)}</p>
      </div>

      {ev.meet && (
        <a
          href={ev.meet}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-control border border-ink bg-ink px-3 text-[13px] font-medium text-on-ink transition-colors hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <IcVideo />
          Entrar no Meet
        </a>
      )}

      <Pares
        itens={[
          { rotulo: "Convidados", valor: convidados(ev) },
          { rotulo: "Local", valor: ev.local || (ev.meet ? "Google Meet" : "—") },
          { rotulo: "Organizador", valor: ev.organizador ?? "você" },
        ]}
      />

      {ev.descricao && (
        <p className="line-clamp-6 whitespace-pre-line text-[13px] leading-relaxed text-fg-dim">{ev.descricao}</p>
      )}

      {conversa && (
        <Link
          href={rotas.chat(conversa.slug)}
          title={`Abrir a conversa ${conversa.nome}`}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-control border border-line-2 bg-surface px-3 text-[13px] font-medium text-fg transition-colors hover:border-fg-mute hover:bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <IcConversa />
          Abrir conversa do cliente
        </Link>
      )}

      {ev.recorrente && ev.editavel && (
        <p className="text-[12.5px] text-fg-faint">Evento que se repete: editar ou apagar vale só para este dia.</p>
      )}

      {ev.editavel ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="subtle" size="sm" onClick={() => aoEditar(ev)}>
            Editar
          </Button>
          <BotaoConfirmar
            pergunta={ev.convidados.length ? "Apagar? Os convidados recebem o aviso do Google." : "Apagar do Google Agenda?"}
            confirmar="Apagar evento"
            aoConfirmar={apagar}
          >
            Apagar…
          </BotaoConfirmar>
        </div>
      ) : (
        <p className="text-[12.5px] text-fg-faint">
          {ev.organizador
            ? `Quem organizou (${ev.organizador}) é quem pode alterar este evento.`
            : "Esta agenda é só de leitura."}
        </p>
      )}
      {erro && <p className="text-[12.5px] text-danger">{erro}</p>}

      {ev.link && (
        <a
          href={ev.link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 self-start text-[12.5px] text-fg-faint underline-offset-2 hover:text-fg hover:underline"
        >
          Abrir no Google Agenda
          <IcExterno className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}
