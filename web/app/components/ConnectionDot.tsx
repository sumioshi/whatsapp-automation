"use client";

import { useEffect, useState } from "react";
import { checarSessao, useRotas } from "./RotasPainel";

type Status = { connection?: string; qr?: string | null };

export interface EstadoColetor {
  /** Já veio a primeira resposta (ou falha) — antes disso nada é afirmado. */
  carregado: boolean;
  open: boolean;
  pairing: boolean;
}

/** Polling leve (5 s) do status do coletor pela rota da área atual. */
export function useStatusColetor(): EstadoColetor {
  const rotas = useRotas();
  const [status, setStatus] = useState<Status | null>(null);
  const [reachable, setReachable] = useState(true);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = checarSessao(await fetch(rotas.status, { cache: "no-store" }), rotas);
        const data = (await res.json()) as Status;
        if (alive) {
          setStatus(data);
          setReachable(true);
        }
      } catch {
        if (alive) setReachable(false);
      } finally {
        if (alive) setCarregado(true);
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [rotas]);

  const open = reachable && status?.connection === "open";
  const pairing = Boolean(reachable && (status?.qr || status?.connection === "connecting"));
  return { carregado, open, pairing };
}

/** Bolinha a partir de um estado já lido (quem mostra mais coisa reaproveita o mesmo polling). */
export function PontoDeConexao({ open, pairing }: Pick<EstadoColetor, "open" | "pairing">) {
  const color = open ? "bg-ok" : pairing ? "bg-accent" : "bg-danger";
  const label = open ? "conectado" : pairing ? "pareando" : "offline";

  return (
    <span className="relative inline-flex h-2 w-2" title={`Coletor: ${label}`}>
      {(open || pairing) && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${color}`}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

/** Bolinha de status da conexão do coletor (verde = aberto, âmbar = pareando, vermelho = offline). */
export function ConnectionDot() {
  const { open, pairing } = useStatusColetor();
  return <PontoDeConexao open={open} pairing={pairing} />;
}
