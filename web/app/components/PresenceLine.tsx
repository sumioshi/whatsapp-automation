"use client";

import { type ReactNode, useEffect, useState } from "react";
import { checarSessao, useRotas } from "./RotasPainel";

type Status = "typing" | "recording" | "online" | "offline";
interface Presence {
  status: Status;
  lastSeen: number | null;
  /** Número de quem está digitando (no grupo, o participante). */
  participante?: string | null;
}

/** "visto há X": granularidade humana e curta. */
function lastSeenLabel(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "visto agora há pouco";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `visto há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `visto há ${h} h`;
  return `visto há ${Math.floor(h / 24)} d`;
}

/**
 * Presença no cabeçalho da conversa ("Dr. Paulo digitando…", "online", "visto
 * há 3 min"). Consulta leve a cada 5 s, independente das mensagens. Sem sinal
 * útil, mostra o `fallback`. `nomeDe` traduz o número do participante.
 */
export function PresenceLine({
  slug,
  fallback = null,
  nomeDe,
}: {
  slug: string;
  fallback?: ReactNode;
  nomeDe?: (numero: string) => string | null;
}) {
  const [presence, setPresence] = useState<Presence | null>(null);
  const rotas = useRotas();

  useEffect(() => {
    let alive = true;
    setPresence(null); // limpa ao trocar de conversa
    async function poll() {
      try {
        const res = checarSessao(await fetch(rotas.presenca(slug), { cache: "no-store" }), rotas);
        if (!res.ok) return;
        const data = (await res.json()) as { presence: Presence | null };
        if (alive) setPresence(data.presence);
      } catch {
        /* coletor ou painel reiniciando: mantém o último estado */
      }
    }
    void poll();
    const id = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [slug, rotas]);

  if (!presence) return <>{fallback}</>;

  if (presence.status === "typing" || presence.status === "recording") {
    const quem = presence.participante ? nomeDe?.(presence.participante) : null;
    const acao = presence.status === "recording" ? "gravando áudio" : "digitando";
    return (
      <span className="text-id-ia" aria-live="polite">
        {quem ? `${quem} ${acao}…` : `${acao.charAt(0).toUpperCase()}${acao.slice(1)}…`}
      </span>
    );
  }

  if (presence.status === "online") return <span>online agora</span>;
  if (presence.lastSeen) return <span>{lastSeenLabel(presence.lastSeen)}</span>;
  return <>{fallback}</>;
}
