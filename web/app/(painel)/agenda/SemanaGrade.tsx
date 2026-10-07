"use client";

import { useEffect, useMemo, useRef } from "react";
import { blocosDaSemana, corDoTexto, minutosBrt, rotuloDoDia } from "@/lib/agenda-semana";
import type { Evento } from "@/lib/google/evento";

const PX_POR_MIN = 0.8;
const ALTURA_DIA = 24 * 60 * PX_POR_MIN;
const COLUNAS = "3.5rem repeat(7, minmax(0, 1fr))";
const HORAS = Array.from({ length: 24 }, (_, h) => h);

interface Props {
  dias: string[];
  eventos: Evento[];
  hoje: string;
  aoClicarHorario: (dia: string, minuto: number) => void;
  aoClicarEvento: (ev: Evento) => void;
}

/** Semana de segunda a domingo; abre rolada nas 7h e mostra a linha da hora atual. */
export function SemanaGrade({ dias, eventos, hoje, aoClicarHorario, aoClicarEvento }: Props) {
  const rolagem = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rolagem.current?.scrollTo({ top: 7 * 60 * PX_POR_MIN });
  }, []);
  const { blocos, diaInteiro } = useMemo(() => blocosDaSemana(eventos, dias), [eventos, dias]);
  const porChave = useMemo(() => new Map(eventos.map((e) => [`${e.agenda}|${e.id}`, e])), [eventos]);
  const agoraMin = minutosBrt(Date.now());

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid border-b border-line" style={{ gridTemplateColumns: COLUNAS }}>
        <div />
        {dias.map((d) => (
          <div key={d} className="min-w-0 border-l border-line px-2 py-1">
            <p className={`text-xs ${d === hoje ? "font-medium text-accent" : "text-fg-dim"}`}>{rotuloDoDia(d)}</p>
            <div className="mt-1 flex flex-col gap-0.5">
              {(diaInteiro[d] ?? []).map((ev) => (
                <button
                  key={`${ev.agenda}|${ev.id}`}
                  type="button"
                  onClick={() => aoClicarEvento(ev)}
                  className="truncate rounded px-1 text-left text-[11px]"
                  style={{ background: ev.cor, color: corDoTexto(ev.cor) }}
                  title={ev.titulo}
                >
                  {ev.titulo}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div ref={rolagem} className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: COLUNAS, height: ALTURA_DIA }}>
          <div className="relative">
            {HORAS.map((h) => (
              <span
                key={h}
                className="mono absolute right-2 -translate-y-1/2 text-[10px] text-fg-faint"
                style={{ top: h * 60 * PX_POR_MIN }}
              >
                {h ? `${String(h).padStart(2, "0")}:00` : ""}
              </span>
            ))}
          </div>
          {dias.map((d) => (
            <div
              key={d}
              className="relative cursor-pointer border-l border-line"
              onClick={(e) => {
                const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                aoClicarHorario(d, Math.max(0, Math.floor(y / PX_POR_MIN)));
              }}
            >
              {HORAS.map((h) => (
                <div
                  key={h}
                  className="pointer-events-none absolute inset-x-0 border-t border-line/50"
                  style={{ top: h * 60 * PX_POR_MIN }}
                />
              ))}
              {d === hoje && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-danger"
                  style={{ top: agoraMin * PX_POR_MIN }}
                />
              )}
              {blocos
                .filter((b) => b.dia === d)
                .map((b) => {
                  const ev = porChave.get(b.chave);
                  if (!ev) return null;
                  return (
                    <button
                      key={`${b.chave}|${d}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        aoClicarEvento(ev);
                      }}
                      className="absolute overflow-hidden rounded px-1 text-left text-[11px] leading-tight shadow-sm"
                      style={{
                        top: b.topoMin * PX_POR_MIN,
                        height: Math.max(16, (b.fimMin - b.topoMin) * PX_POR_MIN - 2),
                        left: `calc(${(b.coluna / b.colunas) * 100}% + 2px)`,
                        width: `calc(${100 / b.colunas}% - 4px)`,
                        background: ev.cor,
                        color: corDoTexto(ev.cor),
                      }}
                      title={`${ev.titulo} · ${b.rotuloHora}`}
                    >
                      <span className="block truncate font-medium">{ev.titulo}</span>
                      <span className="block truncate opacity-80">{b.rotuloHora}</span>
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
