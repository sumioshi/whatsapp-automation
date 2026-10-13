"use client";

import { useEffect, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/app/components/ui";
import { entradaDoRascunho, type Rascunho } from "@/lib/agenda-semana";
import type { Agenda } from "@/lib/google/evento";

interface Props {
  rascunho: Rascunho;
  agendas: Agenda[];
  aoFechar: () => void;
  aoSalvar: () => void;
  /** Recarrega a grade sem fechar (o evento mudou ou sumiu no Google). */
  aoRecarregar: () => void;
}

/** Criar, editar ou apagar um evento. Agenda só leitura abre só para ver. */
export function EventoModal({ rascunho, agendas, aoFechar, aoSalvar, aoRecarregar }: Props) {
  const [r, setR] = useState(rascunho);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const novo = !r.id;
  const leitura = !r.editavel;
  const gravaveis = agendas.filter((a) => a.gravavel);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);

  function mudar<K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) {
    setR((atual) => ({ ...atual, [campo]: valor }));
  }

  async function enviar(metodo: "POST" | "PATCH" | "DELETE") {
    setOcupado(true);
    setErro(null);
    try {
      const res =
        metodo === "DELETE"
          ? await fetch(`/api/agenda/eventos?${new URLSearchParams({ agenda: r.agenda, id: r.id ?? "" })}`, {
              method: "DELETE",
            })
          : await fetch("/api/agenda/eventos", {
              method: metodo,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(metodo === "PATCH" ? { ...entradaDoRascunho(r), id: r.id } : entradaDoRascunho(r)),
            });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 404) aoRecarregar();
      if (!res.ok) throw new Error(data.error ?? "falha ao salvar");
      aoSalvar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro");
      setOcupado(false);
    }
  }

  return (
    <div
      className="overlay-in fixed inset-0 z-50 grid place-items-center bg-scrim p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="ev-modal-titulo"
        className="pop-in flex max-h-full w-full max-w-md flex-col gap-3.5 overflow-y-auto rounded-[14px] bg-surface p-6 [box-shadow:var(--float)] max-[860px]:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!leitura) void enviar(novo ? "POST" : "PATCH");
        }}
      >
        <h2 id="ev-modal-titulo" className="text-[16px] font-semibold tracking-[-0.01em] text-fg">
          {novo ? "Novo evento" : leitura ? "Evento" : "Editar evento"}
        </h2>
        {leitura && (
          <p className="text-[12.5px] text-fg-dim">
            {r.organizador
              ? `Quem organizou (${r.organizador}) é quem pode alterar este evento.`
              : "Esta agenda é só de leitura."}
          </p>
        )}
        {r.recorrente && !leitura && (
          <p className="text-[12.5px] text-fg-dim">Evento que se repete: a alteração vale só para este dia.</p>
        )}
        <fieldset disabled={leitura || ocupado} className="flex flex-col gap-3">
          <Field label="Título" htmlFor="ev-titulo">
            <Input id="ev-titulo" autoFocus value={r.titulo} onChange={(e) => mudar("titulo", e.target.value)} />
          </Field>
          <label className="flex min-h-8 items-center gap-2 text-[13px] text-fg">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={r.diaInteiro}
              onChange={(e) => mudar("diaInteiro", e.target.checked)}
            />
            Dia inteiro
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Início" htmlFor="ev-dia">
              <Input id="ev-dia" type="date" value={r.dia} onChange={(e) => mudar("dia", e.target.value)} />
            </Field>
            {!r.diaInteiro && (
              <Field label="Hora" htmlFor="ev-hi">
                <Input id="ev-hi" type="time" value={r.horaInicio} onChange={(e) => mudar("horaInicio", e.target.value)} />
              </Field>
            )}
            <Field label="Fim" htmlFor="ev-diafim">
              <Input id="ev-diafim" type="date" value={r.diaFim} onChange={(e) => mudar("diaFim", e.target.value)} />
            </Field>
            {!r.diaInteiro && (
              <Field label="Hora" htmlFor="ev-hf">
                <Input id="ev-hf" type="time" value={r.horaFim} onChange={(e) => mudar("horaFim", e.target.value)} />
              </Field>
            )}
          </div>
          {novo && (
            <Field label="Agenda" htmlFor="ev-agenda">
              <Select id="ev-agenda" value={r.agenda} onChange={(e) => mudar("agenda", e.target.value)}>
                {gravaveis.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Local" htmlFor="ev-local">
            <Input id="ev-local" value={r.local} onChange={(e) => mudar("local", e.target.value)} />
          </Field>
          <Field label="Descrição" htmlFor="ev-desc">
            <Textarea id="ev-desc" rows={3} value={r.descricao} onChange={(e) => mudar("descricao", e.target.value)} />
          </Field>
          <Field label="Convidados" htmlFor="ev-conv" hint="E-mails separados por vírgula. O Google manda convite para eles.">
            <Input id="ev-conv" value={r.convidados} onChange={(e) => mudar("convidados", e.target.value)} />
          </Field>
          {r.linkMeet ? (
            <a href={r.linkMeet} target="_blank" rel="noreferrer" className="self-start text-[13px] font-medium text-accent hover:underline">
              Entrar no Meet
            </a>
          ) : (
            <label className="flex min-h-8 items-center gap-2 text-[13px] text-fg">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={r.meet} onChange={(e) => mudar("meet", e.target.checked)} />
              Criar link do Google Meet
            </label>
          )}
        </fieldset>
        {r.link && (
          <a href={r.link} target="_blank" rel="noreferrer" className="self-start text-[12.5px] text-fg-faint underline-offset-2 hover:text-fg hover:underline">
            Abrir no Google Agenda
          </a>
        )}
        {erro && (
          <p role="alert" className="text-[12.5px] text-danger">
            {erro}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2">
          {!novo &&
            !leitura &&
            (confirmando ? (
              <Button type="button" variant="danger" size="sm" disabled={ocupado} onClick={() => void enviar("DELETE")}>
                Confirmar exclusão
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(true)}>
                Apagar
              </Button>
            ))}
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={aoFechar}>
            {leitura ? "Fechar" : "Cancelar"}
          </Button>
          {!leitura && (
            <Button type="submit" size="sm" disabled={ocupado || !r.titulo.trim()}>
              {ocupado ? "Salvando…" : "Salvar"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
