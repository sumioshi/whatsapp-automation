"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { horaCurta } from "@/lib/caixa";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface Notas {
  valor: string;
  mudar: (texto: string) => void;
  status: SaveStatus;
  /** ISO do último salvamento nesta sessão. */
  salvoEm: string | null;
}

/** Notas livres do cliente (mini-CRM): carrega do /api/triage e salva sozinho ~600 ms depois de parar de digitar. */
export function useNotas(slug: string, ativo = true): Notas {
  const [valor, setValor] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ativo) return;
    let alive = true;
    fetch("/api/triage", { cache: "no-store" })
      .then((r) => r.json())
      .then((t: { notes?: Record<string, string> }) => {
        if (alive) setValor(t.notes?.[slug] ?? "");
      })
      .catch(() => {
        /* painel reiniciando: o campo fica vazio */
      });
    return () => {
      alive = false;
    };
  }, [slug, ativo]);

  const salvar = useCallback(
    async (nota: string) => {
      setStatus("saving");
      try {
        const res = await fetch("/api/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "note", slug, value: nota }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "falha ao salvar");
        setStatus("saved");
        setSalvoEm(new Date().toISOString());
      } catch {
        setStatus("error");
      }
    },
    [slug],
  );

  const mudar = useCallback(
    (texto: string) => {
      setValor(texto);
      setStatus("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => salvar(texto), 600);
    },
    [salvar],
  );

  // Timer pendente ao desmontar não salva fora de tela.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { valor, mudar, status, salvoEm };
}

/** Estado do salvamento, para o cabeçalho da seção ("salvo 14:02"). */
export function EstadoNotas({ notas }: { notas: Notas }) {
  if (notas.status === "idle") return null;
  if (notas.status === "error") return <span className="text-danger">erro ao salvar</span>;
  if (notas.status === "saving") return <span>salvando…</span>;
  return (
    <span>
      salvo <span className="font-mono tabular-nums">{horaCurta(notas.salvoEm)}</span>
    </span>
  );
}

export function NotesPanel({ notas, nome }: { notas: Notas; nome: string }) {
  return (
    <textarea
      value={notas.valor}
      onChange={(e) => notas.mudar(e.target.value)}
      rows={4}
      placeholder="Stack, contato, prazos, o que pesa para este cliente…"
      aria-label={`Notas sobre ${nome}`}
      className="focus-ring block min-h-[84px] w-full resize-y rounded-control border border-line bg-surface px-3 py-2.5 text-[13px] leading-normal text-fg placeholder:text-fg-mute"
    />
  );
}
