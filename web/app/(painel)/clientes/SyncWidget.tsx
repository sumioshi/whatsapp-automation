"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/app/components/ui";
import { IcSincronizar } from "./icones";

interface Info {
  proximaExecucao: string | null;
  ultimaExecucao: string | null;
}

/**
 * Reconciliador, discreto na barra de filtros: quanto falta para a próxima
 * sincronização automática e o clique como intervenção manual (não é o caminho normal).
 */
export function SyncWidget({ className }: { className?: string }) {
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
      /* silencioso — a contagem segue */
    } finally {
      setRodando(false);
    }
  }

  const proxMs = info?.proximaExecucao ? new Date(info.proximaExecucao).getTime() : null;
  const faltamMin = proxMs ? Math.max(0, Math.ceil((proxMs - agora) / 60_000)) : null;
  const quando = faltamMin === null ? "Sincronização automática de nomes e histórico" : `Próxima sincronização automática em ${faltamMin} min`;

  return (
    <button
      type="button"
      onClick={() => void sincronizarAgora()}
      disabled={rodando}
      title={`${quando}. Clique para sincronizar agora.`}
      aria-label={`Sincronizar agora. ${quando}.`}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-[12.5px] text-fg-faint transition-colors hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-60 max-[860px]:h-10 max-[860px]:w-10 max-[860px]:justify-center max-[860px]:px-0",
        className,
      )}
    >
      <IcSincronizar className={cn("h-3.5 w-3.5", rodando && "animate-spin motion-reduce:animate-none")} />
      {/* No celular fica só o ícone; o tempo segue no title e no nome acessível. */}
      <span className="max-[860px]:sr-only">
        {rodando ? (
          "sincronizando…"
        ) : faltamMin === null ? (
          "sincronizar"
        ) : (
          <>
            <span className="font-mono tabular-nums">{faltamMin}</span> min
          </>
        )}
      </span>
    </button>
  );
}
