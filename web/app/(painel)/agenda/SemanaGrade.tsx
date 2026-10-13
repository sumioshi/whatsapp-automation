"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/app/components/ui";
import { blocosDaSemana, corDoTexto, hhmm, minutosBrt } from "@/lib/agenda-semana";
import type { Evento } from "@/lib/google/evento";

/** Uma hora mede 52 px, como no protótipo. */
const PX_POR_HORA = 52;
const PX_POR_MIN = PX_POR_HORA / 60;
const ALTURA_DIA = 24 * PX_POR_HORA;
const COLUNAS = "64px repeat(7, minmax(0, 1fr))";
const HORAS = Array.from({ length: 23 }, (_, i) => i + 1);
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export const chaveDoEvento = (ev: Pick<Evento, "agenda" | "id">) => `${ev.agenda}|${ev.id}`;

/** Fundo, borda e texto saem da cor da agenda misturada ao tema; selecionado ganha a cor cheia. */
const EVENTO =
  "border text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent " +
  "border-[color-mix(in_srgb,var(--c)_34%,var(--color-surface))] bg-[color-mix(in_srgb,var(--c)_16%,var(--color-surface))] " +
  "text-[color-mix(in_srgb,var(--c)_62%,var(--color-fg))] hover:bg-[color-mix(in_srgb,var(--c)_24%,var(--color-surface))]";
const EVENTO_SEL = "border text-left border-[var(--c)] bg-[var(--c)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

function estiloDoEvento(ev: Evento, selecionado: boolean, extra: CSSProperties = {}): CSSProperties {
  return { "--c": ev.cor, ...(selecionado ? { color: corDoTexto(ev.cor) } : {}), ...extra } as CSSProperties;
}

/** Faixa horizontal de um bloco quando eventos se sobrepõem e dividem a coluna. */
function faixa(coluna: number, colunas: number): { left: string; width: string } {
  const folga = colunas === 1 ? 4 : 2;
  return {
    left: `calc(${(coluna / colunas) * 100}% + ${folga}px)`,
    width: `calc(${100 / colunas}% - ${folga * 2}px)`,
  };
}

interface Props {
  dias: string[];
  eventos: Evento[];
  hoje: string;
  selecionado: string | null;
  aoClicarHorario: (dia: string, minuto: number) => void;
  aoClicarEvento: (ev: Evento) => void;
}

/** Semana de segunda a domingo: abre rolada nas 7h, linha "dia todo" e a linha do agora no dia de hoje. */
export function SemanaGrade({ dias, eventos, hoje, selecionado, aoClicarHorario, aoClicarEvento }: Props) {
  const rolagem = useRef<HTMLDivElement>(null);
  // A linha do agora só nasce no navegador: o minuto do servidor e o do navegador podem diferir.
  const [agoraMin, setAgoraMin] = useState<number | null>(null);
  useEffect(() => {
    rolagem.current?.scrollTo({ top: 7 * PX_POR_HORA });
    setAgoraMin(minutosBrt(Date.now()));
    const t = window.setInterval(() => setAgoraMin(minutosBrt(Date.now())), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const { blocos, diaInteiro } = useMemo(() => blocosDaSemana(eventos, dias), [eventos, dias]);
  const porChave = useMemo(() => new Map(eventos.map((e) => [chaveDoEvento(e), e])), [eventos]);

  return (
    <div ref={rolagem} className="min-h-0 min-w-0 overflow-auto bg-surface">
      <div className="grid min-w-[780px]" style={{ gridTemplateColumns: COLUNAS }}>
        <div className="sticky top-0 z-[3] h-14 border-b border-line bg-surface" />
        {dias.map((d) => {
          const eHoje = d === hoje;
          return (
            <div
              key={d}
              className={cn(
                "sticky top-0 z-[3] flex h-14 items-center gap-2 border-b border-l border-line bg-surface px-3 text-[12.5px]",
                eHoje ? "font-medium text-accent" : "text-fg-faint",
              )}
            >
              <span
                className={cn(
                  "grid h-[30px] w-[30px] place-items-center rounded-full font-mono text-[15px] font-medium tabular-nums",
                  eHoje ? "bg-accent text-accent-ink" : "text-fg",
                )}
              >
                {Number(d.slice(8, 10))}
              </span>
              {DIAS_CURTOS[new Date(`${d}T00:00:00Z`).getUTCDay()]}
              {eHoje && <span className="sr-only">, hoje</span>}
            </div>
          );
        })}

        <div className="sticky top-14 z-[3] flex min-h-[34px] items-center justify-end whitespace-nowrap border-b border-line bg-surface pr-2.5 text-[10.5px] text-fg-faint">
          dia todo
        </div>
        {dias.map((d) => (
          <div key={d} className="sticky top-14 z-[3] flex min-h-[34px] flex-col gap-1 border-b border-l border-line bg-surface p-1">
            {(diaInteiro[d] ?? []).map((ev) => {
              const sel = selecionado === chaveDoEvento(ev);
              return (
                <button
                  key={chaveDoEvento(ev)}
                  type="button"
                  onClick={() => aoClicarEvento(ev)}
                  aria-pressed={sel}
                  title={ev.titulo}
                  style={estiloDoEvento(ev, sel)}
                  className={cn(sel ? EVENTO_SEL : EVENTO, "block h-6 w-full truncate rounded-[7px] px-2 text-[12px] font-semibold")}
                >
                  {ev.titulo}
                </button>
              );
            })}
          </div>
        ))}

        <div className="relative" style={{ height: ALTURA_DIA }}>
          {HORAS.map((h) => (
            <span
              key={h}
              className="absolute right-2.5 -translate-y-1/2 font-mono text-[11px] leading-none tabular-nums text-fg-faint"
              style={{ top: h * PX_POR_HORA }}
            >
              {hhmm(h * 60)}
            </span>
          ))}
        </div>
        {dias.map((d) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: o teclado marca evento pelo botão "Evento" do cabeçalho
          // biome-ignore lint/a11y/noStaticElementInteractions: clique no horário vazio é atalho de mouse
          <div
            key={d}
            className={cn(
              "relative cursor-pointer border-l border-line",
              d === hoje && "bg-[color-mix(in_srgb,var(--color-accent-soft)_45%,transparent)]",
            )}
            style={{
              height: ALTURA_DIA,
              backgroundImage: `repeating-linear-gradient(to bottom, var(--color-line) 0 1px, transparent 1px ${PX_POR_HORA}px)`,
            }}
            onClick={(e) => {
              const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
              aoClicarHorario(d, Math.max(0, Math.floor(y / PX_POR_MIN)));
            }}
          >
            {blocos
              .filter((b) => b.dia === d)
              .map((b) => {
                const ev = porChave.get(b.chave);
                if (!ev) return null;
                const sel = selecionado === b.chave;
                const altura = Math.max(24, (b.fimMin - b.topoMin) * PX_POR_MIN - 2);
                return (
                  <button
                    key={`${b.chave}|${d}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      aoClicarEvento(ev);
                    }}
                    aria-pressed={sel}
                    title={`${ev.titulo} · ${b.rotuloHora}`}
                    style={estiloDoEvento(ev, sel, { top: b.topoMin * PX_POR_MIN + 1, height: altura, ...faixa(b.coluna, b.colunas) })}
                    className={cn(sel ? EVENTO_SEL : EVENTO, "absolute z-[1] overflow-hidden rounded-[7px] px-2 py-[5px]")}
                  >
                    <span className="block truncate text-[12px] font-semibold leading-[1.3]">{ev.titulo}</span>
                    {altura > 34 && (
                      <span
                        className={cn(
                          "block truncate font-mono text-[11px] leading-[1.3] tabular-nums",
                          sel ? "opacity-85" : "text-[color-mix(in_srgb,var(--c)_40%,var(--color-fg-dim))]",
                        )}
                      >
                        {b.rotuloHora}
                      </span>
                    )}
                  </button>
                );
              })}
            {d === hoje && agoraMin !== null && (
              <div className="pointer-events-none absolute inset-x-0 z-[2] border-t border-danger" style={{ top: agoraMin * PX_POR_MIN }}>
                <span className="absolute -left-1 -top-1 h-[7px] w-[7px] rounded-full bg-danger" />
                <span className="sr-only">Agora, {hhmm(agoraMin)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
