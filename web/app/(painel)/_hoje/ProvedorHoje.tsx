"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { diaBrt, somarDias } from "@/lib/agenda-semana";
import type { EstadoAgenda, Evento } from "@/lib/google/evento";
import type { TicketResumo } from "@/lib/hoje";

/**
 * O que a tela Hoje busca do navegador: a fila de envio da IA (no coletor) e a
 * agenda do Google (na nuvem). A frase do cabeçalho, a faixa e os cards leem o
 * mesmo estado, então cada fonte é consultada uma vez só. O resto da tela vem
 * pronto do servidor e se renova sozinho.
 */

export type EstadoFila = { tipo: "carregando" } | { tipo: "indisponivel" } | { tipo: "ok"; tickets: TicketResumo[] };

export type EstadoAgendaHoje =
  | { tipo: "carregando" }
  | { tipo: "nao-configurada" }
  | { tipo: "desconectada" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "ok"; eventos: Evento[] };

interface Contexto {
  agoraMs: number;
  fila: EstadoFila;
  agenda: EstadoAgendaHoje;
}

const Ctx = createContext<Contexto>({ agoraMs: 0, fila: { tipo: "carregando" }, agenda: { tipo: "carregando" } });

export function useHoje(): Contexto {
  return useContext(Ctx);
}

const FILA_MS = 15_000;
const AGENDA_MS = 60_000;
const TELA_MS = 30_000;
const RELOGIO_MS = 30_000;
/** A mesma escolha de agendas ligadas da tela Agenda. */
const OCULTAS_KEY = "wac-agenda-ocultas";

function agendasOcultas(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(OCULTAS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function lerFila(): Promise<EstadoFila> {
  try {
    const res = await fetch("/api/entregas", { cache: "no-store" });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; entregas?: TicketResumo[] } | null;
    return res.ok && data?.ok && Array.isArray(data.entregas) ? { tipo: "ok", tickets: data.entregas } : { tipo: "indisponivel" };
  } catch {
    return { tipo: "indisponivel" };
  }
}

async function lerAgenda(): Promise<EstadoAgendaHoje> {
  try {
    const res = await fetch("/api/agenda/estado", { cache: "no-store" });
    const estado = (await res.json().catch(() => null)) as (Partial<EstadoAgenda> & { error?: string }) | null;
    if (!res.ok || !estado) return { tipo: "erro", mensagem: estado?.error ?? "O Google Agenda não respondeu." };
    if (estado.configurado === false) return { tipo: "nao-configurada" };
    if (!estado.conectado) return { tipo: "desconectada" };
    const ocultas = agendasOcultas();
    const visiveis = (estado.agendas ?? []).map((a) => a.id).filter((id) => !ocultas.includes(id));
    if (visiveis.length === 0) return { tipo: "ok", eventos: [] };
    const hoje = diaBrt(Date.now());
    const q = new URLSearchParams({
      de: `${hoje}T00:00:00-03:00`,
      ate: `${somarDias(hoje, 1)}T00:00:00-03:00`,
      agendas: visiveis.join(","),
    });
    const r = await fetch(`/api/agenda/eventos?${q}`, { cache: "no-store" });
    const eventos = (await r.json().catch(() => null)) as Evento[] | { error?: string; codigo?: string } | null;
    if (r.ok && Array.isArray(eventos)) return { tipo: "ok", eventos };
    const falha = (eventos ?? {}) as { error?: string; codigo?: string };
    if (falha.codigo === "desconectado") return { tipo: "desconectada" };
    return { tipo: "erro", mensagem: falha.error ?? "O Google Agenda não respondeu." };
  } catch {
    return { tipo: "erro", mensagem: "Sem conexão com o painel." };
  }
}

/** Repete `fn` no intervalo enquanto a aba está visível, e de novo ao voltar para ela. */
function useRepetir(fn: () => void, ms: number) {
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") fn();
    }, ms);
    const voltou = () => {
      if (document.visibilityState === "visible") fn();
    };
    document.addEventListener("visibilitychange", voltou);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", voltou);
    };
  }, [fn, ms]);
}

export function ProvedorHoje({ agoraMs: agoraDoServidor, children }: { agoraMs: number; children: ReactNode }) {
  const router = useRouter();
  // Começa no relógio do servidor para o HTML bater com a hidratação.
  const [agoraMs, setAgoraMs] = useState(agoraDoServidor);
  const [fila, setFila] = useState<EstadoFila>({ tipo: "carregando" });
  const [agenda, setAgenda] = useState<EstadoAgendaHoje>({ tipo: "carregando" });

  const [acoes] = useState(() => ({
    relogio: () => setAgoraMs(Date.now()),
    fila: () => void lerFila().then(setFila),
    agenda: () => void lerAgenda().then(setAgenda),
    tela: () => router.refresh(),
  }));

  useEffect(() => {
    acoes.relogio();
    acoes.fila();
    acoes.agenda();
  }, [acoes]);

  useRepetir(acoes.relogio, RELOGIO_MS);
  useRepetir(acoes.fila, FILA_MS);
  useRepetir(acoes.agenda, AGENDA_MS);
  useRepetir(acoes.tela, TELA_MS);

  return <Ctx.Provider value={{ agoraMs, fila, agenda }}>{children}</Ctx.Provider>;
}
