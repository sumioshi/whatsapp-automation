"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SectionLabel, Textarea } from "./ui";

type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Mini-CRM por grupo: notas livres do cliente (stack, contato, prazos, contexto). */
export function NotesPanel({ slug }: { slug: string }) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carrega a nota salva do grupo ao montar (e ao trocar de grupo).
  useEffect(() => {
    let alive = true;
    fetch("/api/triage", { cache: "no-store" })
      .then((r) => r.json())
      .then((t: { notes?: Record<string, string> }) => {
        if (alive) setValue(t.notes?.[slug] ?? "");
      })
      .catch(() => {
        /* painel pode estar reiniciando — deixa o textarea vazio */
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  // Persiste a nota (chamado pelo debounce). Indica salvando/salvo/erro.
  const save = useCallback(
    async (note: string) => {
      setStatus("saving");
      try {
        const res = await fetch("/api/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "note", slug, value: note }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "falha ao salvar");
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    },
    [slug],
  );

  // Autosave com debounce (~600ms): cada tecla rearma o timer.
  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setValue(next);
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), 600);
  }

  // Limpa o timer pendente ao desmontar (evita salvar fora de tela).
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionLabel>Notas</SectionLabel>
        <StatusHint status={status} />
      </div>
      <Textarea
        value={value}
        onChange={onChange}
        rows={6}
        placeholder="Notas do cliente: stack, contato, prazos, contexto…"
        aria-label="Notas do cliente"
      />
    </section>
  );
}

/** Indicador discreto de estado do autosave (mono, text-fg-faint). */
function StatusHint({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  const text =
    status === "saving" ? "salvando…" : status === "saved" ? "salvo" : "erro ao salvar";
  return (
    <span
      className={`mono text-[10px] ${status === "error" ? "text-danger" : "text-fg-faint"}`}
    >
      {text}
    </span>
  );
}
