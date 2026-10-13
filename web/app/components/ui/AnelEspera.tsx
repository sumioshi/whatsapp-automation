import { Fragment } from "react";
import { formatarEspera, fracaoAnel, nivelEspera } from "@/lib/aparencia";
import { cn } from "./cn";

const COR = { neutro: "text-fg-faint", atencao: "text-warn", urgente: "text-danger" } as const;
const CIRCUNFERENCIA = 2 * Math.PI * 6;

/** Tempo de espera: anel que enche até 4 h (cheio, ganha miolo) e o tempo em "5h 12m". */
export function AnelEspera({ ms, className }: { ms: number; className?: string }) {
  const fracao = fracaoAnel(ms);
  const partes = formatarEspera(ms);
  const extenso = partes.map((p) => `${p.valor}${p.unidade}`).join(" ");
  return (
    <span
      title={`esperando há ${extenso}`}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[12.5px] font-medium tabular-nums leading-none",
        COR[nivelEspera(ms)],
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 overflow-visible" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="8" cy="8" r="6" opacity="0.22" />
        {fracao < 1 ? (
          <circle
            cx="8"
            cy="8"
            r="6"
            strokeLinecap="round"
            strokeDasharray={`${Math.max(2, fracao * CIRCUNFERENCIA).toFixed(1)} 99`}
            transform="rotate(-90 8 8)"
          />
        ) : (
          <>
            <circle cx="8" cy="8" r="6" />
            <circle cx="8" cy="8" r="2.6" fill="currentColor" stroke="none" />
          </>
        )}
      </svg>
      <span className="sr-only">esperando há {extenso}</span>
      <span aria-hidden>
        {partes.map((p, i) => (
          <Fragment key={p.unidade}>
            {i > 0 ? " " : ""}
            {p.valor}
            <span className="ml-px font-sans text-[11px] opacity-85">{p.unidade}</span>
          </Fragment>
        ))}
      </span>
    </span>
  );
}

/** Anel de espera cheio, com miolo e sem o tempo ao lado: o símbolo de "esperando há mais de 4 h". */
export function AnelCheio({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={cn("h-3.5 w-3.5 shrink-0", className)}>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
