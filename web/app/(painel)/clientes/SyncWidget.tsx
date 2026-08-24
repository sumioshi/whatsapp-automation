"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Info {
  proximaExecucao: string | null;
  ultimaExecucao: string | null;
}

/**
 * Widget do reconciliador: countdown até a próxima sincronização automática e
 * o "agora" como intervenção manual (não é o caminho normal).
 */
export function SyncWidget() {
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [rodando, setRodando] = useState(false);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/reconciler", { cache: "no-store" });
        const data = (await res.json()) as { status?: Info | null };
        if (alive) setInfo(data.status ?? null);
      } catch {
        /* coletor pode estar fora */
      }
    }
    poll();
    const idPoll = setInterval(poll, 30_000);
    const idTick = setInterval(() => setAgora(Date.now()), 10_000);
    return () => {
      alive = false;
      clearInterval(idPoll);
      clearInterval(idTick);
    };
  }, []);

  async function sincronizarAgora() {
    setRodando(true);
    try {
      await fetch("/api/reconciler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "agora" }),
      });
      router.refresh();
    } catch {
      /* silencioso — o countdown segue */
    } finally {
      setRodando(false);
    }
  }

  const proxMs = info?.proximaExecucao ? new Date(info.proximaExecucao).getTime() : null;
  const faltamMin = proxMs ? Math.max(0, Math.ceil((proxMs - agora) / 60_000)) : null;

  return (
    <span className="flex items-center gap-2">
      <span className="mono text-[10px] text-fg-faint" title="Sincronização automática de nomes e histórico com o WhatsApp">
        {faltamMin === null ? "sync automático" : `sync em ${faltamMin}min`}
      </span>
      <button
        type="button"
        onClick={() => void sincronizarAgora()}
        disabled={rodando}
        className="rounded-control border border-line px-2 py-0.5 text-[11px] text-fg-dim transition-colors hover:text-fg disabled:opacity-50"
      >
        {rodando ? "sincronizando…" : "agora"}
      </button>
    </span>
  );
}
