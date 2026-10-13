"use client";

import { useEffect, useState } from "react";
import type { Contrato, EstadoContrato } from "@/lib/contratos";
import { Field, Input, Select } from "./ui";

const ESTADOS: Array<{ id: EstadoContrato; rotulo: string }> = [
  { id: "sem", rotulo: "Sem contrato" },
  { id: "ativo", rotulo: "Ativo" },
  { id: "pausado", rotulo: "Pausado" },
  { id: "encerrado", rotulo: "Encerrado" },
];

const VAZIO: Contrato = { estado: "sem", inicio: null, fim: null, valorMensal: null, nota: "" };

/** Estado comercial do chat, salvo em /api/contratos. Campos vazios viram null. */
export function ContratoForm({ slug, aoSalvar }: { slug: string; aoSalvar?: () => void }) {
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
      .catch(() => {
        if (vivo) setC(VAZIO);
      });
    return () => {
      vivo = false;
    };
  }, [slug]);

  /**
   * Salva o patch. Os campos de texto salvam no blur, e sair do campo sem ter
   * digitado nada é o caso comum: comparar com o valor atual evita um POST
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
      aoSalvar?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro");
    } finally {
      setSalvando(false);
    }
  }

  if (!c) return <p className="mt-3 text-[12.5px] text-fg-faint">Carregando o contrato…</p>;
  const campo = "bg-surface py-1.5 text-[13px]";
  // Os campos seguem editáveis durante o salvamento: desabilitar tira o foco de
  // quem está digitando no campo seguinte. O aviso "salvando…" basta.
  return (
    <section className="mt-3 space-y-3 rounded-control border border-line bg-surface p-3" aria-label="Editar contrato">
      <Field label="Estado" htmlFor={`contrato-estado-${slug}`}>
        <Select
          id={`contrato-estado-${slug}`}
          className={campo}
          value={c.estado}
          onChange={(e) => salvar({ estado: e.target.value as EstadoContrato })}
        >
          {ESTADOS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.rotulo}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Início" htmlFor={`contrato-inicio-${slug}`}>
          <Input
            id={`contrato-inicio-${slug}`}
            type="date"
            className={campo}
            value={c.inicio ?? ""}
            onChange={(e) => salvar({ inicio: e.target.value || null })}
          />
        </Field>
        <Field label="Fim" htmlFor={`contrato-fim-${slug}`}>
          <Input
            id={`contrato-fim-${slug}`}
            type="date"
            className={campo}
            value={c.fim ?? ""}
            onChange={(e) => salvar({ fim: e.target.value || null })}
          />
        </Field>
      </div>
      <Field label="Valor mensal (R$)" htmlFor={`contrato-valor-${slug}`}>
        <Input
          id={`contrato-valor-${slug}`}
          type="number"
          min={0}
          step="0.01"
          className={`${campo} font-mono tabular-nums`}
          defaultValue={c.valorMensal ?? ""}
          onBlur={(e) => salvar({ valorMensal: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </Field>
      <Field label="Nota" htmlFor={`contrato-nota-${slug}`}>
        <Input
          id={`contrato-nota-${slug}`}
          type="text"
          className={campo}
          defaultValue={c.nota}
          onBlur={(e) => salvar({ nota: e.target.value })}
          placeholder="Ex.: renovação anual em dezembro"
        />
      </Field>
      <p className="min-h-[1lh] text-[12px]" aria-live="polite">
        {erro ? <span className="text-danger">{erro}</span> : salvando ? <span className="text-fg-faint">Salvando…</span> : null}
      </p>
    </section>
  );
}
