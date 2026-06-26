"use client";

import { useEffect, useState } from "react";

type Status = { connection?: string; qr?: string | null };

/** Bolinha de status da conexão do coletor (verde = aberto, âmbar = pareando, vermelho = offline). */
export function ConnectionDot() {
  const [status, setStatus] = useState<Status | null>(null);
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        const data = (await res.json()) as Status;
        if (alive) {
          setStatus(data);
          setReachable(true);
        }
      } catch {
        if (alive) setReachable(false);
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const open = reachable && status?.connection === "open";
  const pairing = reachable && (status?.qr || status?.connection === "connecting");
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
