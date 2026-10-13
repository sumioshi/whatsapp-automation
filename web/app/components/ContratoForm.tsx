"use client";

import { useEffect, useState } from "react";
import type { Contrato, EstadoContrato } from "@/lib/contratos";

const ESTADOS: Array<{ id: EstadoContrato; rotulo: string }> = [
  { id: "sem", rotulo: "sem contrato" },
  { id: "ativo", rotulo: "ativo" },
  { id: "pausado", rotulo: "pausado" },
  { id: "encerrado", rotulo: "encerrado" },
];

const VAZIO: Contrato = { estado: "sem", inicio: null, fim: null, valorMensal: null, limiteMensagens: null, nota: "" };

/** Estado comercial do chat, salvo em /api/contratos. Campos vazios viram null. */
export function ContratoForm({ slug }: { slug: string }) {
  const [c, setC] = useState<Contrato | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/contratos", { cache: "no-store" })
      .then((r) => r.json())
      .then((todos: Record<string, Contrato>) => {
        if (vivo) setC(todos[slug] ?? VAZIO);
      })
      .catch(() => { if (vivo) setC(VAZIO); });
    return () => { vivo = false; };
  }, [slug]);

  /**
   * Salva o patch. Os campos de texto salvam no blur, e sair do campo sem ter
   * digitado nada é o caso comum — comparar com o valor atual evita um POST
   * (e uma reescrita do arquivo) a cada passagem de foco.
   */
  async function salvar(patch: Partial<Contrato>) {
    if (!c) return;
    const mudou = (Object.keys(patch) as Array<keyof Contrato>).some((k) => patch[k] !== c[k]);
    if (!mudou) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/contratos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, patch }),
      });
      const body = (await res.json()) as { contrato?: Contrato; error?: string };
      if (!res.ok || !body.contrato) throw new Error(body.error ?? "falha ao salvar");
      setC(body.contrato);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro");
    } finally {
      setSalvando(false);
    }
  }

  if (!c) return <div className="mono text-xs text-fg-dim">contrato…</div>;
  const campo = "w-full rounded-[6px] border border-line bg-transparent px-2 py-1 text-xs text-fg focus:border-line-2 focus:outline-none";
  // Os campos seguem editáveis durante o salvamento: desabilitá-los tira o foco
  // de quem está digitando no campo seguinte. O aviso "salvando…" basta.
  return (
    <section className="space-y-2 border-t border-line pt-3" aria-label="Contrato do cliente">
      <div className="flex items-baseline gap-2 text-[12px] font-medium text-fg-faint">
        Contrato
        {salvando && <span className="normal-case tracking-normal text-fg-dim" aria-live="polite">salvando…</span>}
      </div>
      <select className={campo} value={c.estado} onChange={(e) => salvar({ estado: e.target.value as EstadoContrato })} aria-label="Estado do contrato">
        {ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.rotulo}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <label className="mono text-[10px] text-fg-dim">início
          <input type="date" className={campo} value={c.inicio ?? ""} onChange={(e) => salvar({ inicio: e.target.value || null })} />
        </label>
        <label className="mono text-[10px] text-fg-dim">fim
          <input type="date" className={campo} value={c.fim ?? ""} onChange={(e) => salvar({ fim: e.target.value || null })} />
        </label>
      </div>
      <label className="mono text-[10px] text-fg-dim">valor mensal (R$)
        <input type="number" min={0} step="0.01" className={campo} defaultValue={c.valorMensal ?? ""} onBlur={(e) => salvar({ valorMensal: e.target.value === "" ? null : Number(e.target.value) })} />
      </label>
      <label className="mono text-[10px] text-fg-dim">limite de mensagens (30 dias)
        <input
          type="number"
          min={1}
          step={1}
          className={campo}
          defaultValue={c.limiteMensagens ?? ""}
          placeholder="sem limite"
          onBlur={(e) => salvar({ limiteMensagens: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </label>
      <label className="mono text-[10px] text-fg-dim">nota
        <input type="text" className={campo} defaultValue={c.nota} onBlur={(e) => salvar({ nota: e.target.value })} placeholder="ex.: renovação anual em dezembro" />
      </label>
      {erro && <div className="text-xs text-danger">{erro}</div>}
    </section>
  );
}
