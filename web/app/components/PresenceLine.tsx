"use client";

import { type ReactNode, useEffect, useState } from "react";

type Status = "typing" | "recording" | "online" | "offline";
interface Presence {
  status: Status;
  lastSeen: number | null;
}

/** "visto por último há X" — granularidade humana e curta. */
function lastSeenLabel(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "visto agora há pouco";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `visto há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `visto há ${h} h`;
  const d = Math.floor(h / 24);
  return `visto há ${d} d`;
}

/** Três pontinhos pulsantes (ember discreto) para o "digitando…". */
function TypingDots() {
  return (
    <span aria-hidden className="inline-flex items-center gap-[3px]">
      {[0, 1, 2].map((i) => (
        <span key={i} className="typing-dot h-1 w-1 rounded-full bg-accent" />
      ))}
    </span>
  );
}

/**
 * Linha de presença sutil no header da conversa. Faz polling leve do sidecar via
 * /api/presence (5s) — independente do polling de mensagens. Reduced-motion é
 * respeitado pelo CSS dos pontos. Sem sinal útil, renderiza o `fallback`.
 */
export function PresenceLine({ slug, fallback = null }: { slug: string; fallback?: ReactNode }) {
  const [presence, setPresence] = useState<Presence | null>(null);

  useEffect(() => {
    let alive = true;
    setPresence(null); // limpa ao trocar de conversa
    async function poll() {
      try {
        const res = await fetch(`/api/presence?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { presence: Presence | null };
        if (alive) setPresence(data.presence);
      } catch {
        /* coletor/painel reiniciando — mantém o último estado */
      }
    }
    void poll();
    const id = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [slug]);

  if (!presence) return <>{fallback}</>;

  if (presence.status === "typing" || presence.status === "recording") {
    const label = presence.status === "recording" ? "gravando áudio" : "digitando";
    return (
      <span className="mono inline-flex items-center gap-1.5 text-[11px] text-accent">
        <TypingDots />
        {label}…
      </span>
    );
  }

  if (presence.status === "online") {
    return (
      <span className="mono inline-flex items-center gap-1.5 text-[11px] text-fg-faint">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        online
      </span>
    );
  }

  // offline com lastSeen conhecido
  if (presence.lastSeen) {
    return (
      <span className="mono text-[11px] text-fg-faint">{lastSeenLabel(presence.lastSeen)}</span>
    );
  }
  return <>{fallback}</>;
}
