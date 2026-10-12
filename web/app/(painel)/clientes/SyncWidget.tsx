"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui";
import { IcSincronizar } from "./icones";

interface Info {
  proximaExecucao: string | null;
  ultimaExecucao: string | null;
}

/**
 * Widget do reconciliador: quanto falta para a próxima sincronização automática e
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
      /* silencioso — a contagem segue */
    } finally {
      setRodando(false);
    }
  }

  const proxMs = info?.proximaExecucao ? new Date(info.proximaExecucao).getTime() : null;
  const faltamMin = proxMs ? Math.max(0, Math.ceil((proxMs - agora) / 60_000)) : null;

  return (
    <span className="flex items-center gap-1">
      <span
        className="whitespace-nowrap text-[12.5px] text-fg-faint max-[1100px]:hidden"
        title="Sincronização automática de nomes e histórico com o WhatsApp"
      >
        {faltamMin === null ? (
          "Sincronização automática"
        ) : (
          <>
            Sincroniza em <span className="font-mono tabular-nums">{faltamMin}</span> min
          </>
        )}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void sincronizarAgora()}
        disabled={rodando}
        title="Buscar agora nomes e histórico no WhatsApp"
      >
        <IcSincronizar className={rodando ? "h-3.5 w-3.5 animate-spin motion-reduce:animate-none" : "h-3.5 w-3.5"} />
        {rodando ? "Sincronizando…" : "Sincronizar"}
      </Button>
    </span>
  );
}
