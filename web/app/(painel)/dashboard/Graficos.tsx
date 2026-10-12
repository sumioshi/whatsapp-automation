"use client";

import { useId, useState } from "react";
import { escalaDoEixo, rotuloDoDia, rotulosDoEixo } from "@/lib/graficos";
import { useTamanho } from "./useTamanho";

const numero = new Intl.NumberFormat("pt-BR");
const TEXTO = "fill-fg-faint font-mono text-[11px]";

/** Volume por dia: o período em linha cheia sobre área, o período anterior tracejado; passar o mouse mostra o dia. */
export function GraficoLinha({
  atual,
  anterior,
  dias,
  periodo,
}: {
  atual: number[];
  anterior: number[];
  dias: string[];
  periodo: number;
}) {
  const [ref, t] = useTamanho<HTMLDivElement>();
  const [foco, setFoco] = useState<number | null>(null);
  const gradiente = useId();
  const n = atual.length;
  const maior = Math.max(0, ...atual, ...anterior);
  const { passo, topo } = escalaDoEixo(maior);
  const vazio = maior === 0;
  const resumo = vazio
    ? `Nenhuma mensagem recebida nos últimos ${periodo} dias nem nos ${periodo} anteriores`
    : `Mensagens recebidas por dia nos últimos ${periodo} dias, de ${Math.min(...atual)} a ${Math.max(...atual)} por dia, ${numero.format(atual.reduce((s, v) => s + v, 0))} no total; nos ${periodo} dias anteriores, ${numero.format(anterior.reduce((s, v) => s + v, 0))}`;

  let grafico = null;
  if (t && n > 0) {
    const W = Math.max(260, t.largura);
    const H = Math.max(160, t.altura - 4);
    const L = 14 + 7 * numero.format(topo).length;
    const R = 10;
    const Tp = 12;
    const B = 22;
    const x = (i: number) => (n > 1 ? L + (i * (W - L - R)) / (n - 1) : (L + W - R) / 2);
    const y = (v: number) => Tp + (H - Tp - B) * (1 - v / topo);
    const linha = (s: number[]) => s.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const marcas = Array.from({ length: Math.round(topo / passo) + 1 }, (_, k) => k * passo);
    const i = foco;
    const atualI = i === null ? 0 : (atual[i] ?? 0);
    const anteriorI = i === null ? 0 : (anterior[i] ?? 0);
    const diferenca = atualI - anteriorI;
    grafico = (
      <>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={resumo}
          className="block overflow-visible"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const k = n > 1 ? Math.round((e.clientX - r.left - L) / ((W - L - R) / (n - 1))) : 0;
            setFoco(Math.max(0, Math.min(n - 1, k)));
          }}
          onPointerLeave={() => setFoco(null)}
        >
          <defs>
            <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.26" />
              <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {marcas.map((m) => (
            <g key={m}>
              <line x1={L} x2={W - R} y1={y(m)} y2={y(m)} stroke="var(--color-line)" strokeDasharray={m ? "2 4" : undefined} />
              <text x={L - 8} y={y(m) + 4} textAnchor="end" className={TEXTO}>
                {numero.format(m)}
              </text>
            </g>
          ))}
          {rotulosDoEixo(dias).map((r) => (
            <text key={r.i} x={x(r.i)} y={H - 4} textAnchor="middle" className={TEXTO}>
              {r.texto}
            </text>
          ))}
          {!vazio && (
            <>
              <path d={`${linha(atual)}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`} fill={`url(#${gradiente})`} />
              <path d={linha(anterior)} fill="none" stroke="var(--color-fg-mute)" strokeWidth="1.5" strokeDasharray="4 4" />
              <path
                d={linha(atual)}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2.25"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle cx={x(n - 1)} cy={y(atual[n - 1] ?? 0)} r="4" fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth="2" />
            </>
          )}
          {vazio && (
            <text x={(L + W - R) / 2} y={(Tp + H - B) / 2} textAnchor="middle" className="fill-fg-faint font-sans text-[12.5px]">
              Nenhuma mensagem de cliente no período.
            </text>
          )}
          {i !== null && !vazio && (
            <g>
              <line x1={x(i)} x2={x(i)} y1={Tp} y2={H - B} stroke="var(--color-line-2)" />
              <circle cx={x(i)} cy={y(anteriorI)} r="3.5" fill="var(--color-surface)" stroke="var(--color-fg-mute)" strokeWidth="2" />
              <circle cx={x(i)} cy={y(atualI)} r="4.5" fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth="2" />
            </g>
          )}
          <rect x={L} y="0" width={W - L - R} height={H - B} fill="transparent" className="cursor-crosshair" />
        </svg>
        {i !== null && !vazio && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 min-w-[168px] rounded-[10px] bg-surface px-3 py-2.5 text-[12.5px] [box-shadow:var(--float)]"
            style={{ left: Math.min(W - 90, Math.max(90, x(i))), top: y(Math.max(atualI, anteriorI)), transform: "translate(-50%, calc(-100% - 12px))" }}
          >
            <div className="mb-2 font-mono text-[11.5px] font-medium leading-none text-fg-faint">{rotuloDoDia(dias[i] as string, true)}</div>
            <div className="flex h-[22px] items-center gap-2">
              <i className="h-2 w-2 rounded-full bg-accent" />
              este período
              <span className="ml-auto font-mono font-medium tabular-nums">{numero.format(atualI)}</span>
            </div>
            <div className="flex h-[22px] items-center gap-2">
              <i className="h-2 w-2 rounded-full bg-fg-mute" />
              {periodo} dias antes
              <span className="ml-auto font-mono font-medium tabular-nums">{numero.format(anteriorI)}</span>
            </div>
            <div className={`flex h-[22px] items-center font-mono font-medium tabular-nums ${diferenca >= 0 ? "text-ok" : "text-danger"}`}>
              {diferenca >= 0 ? "+" : "−"}
              {numero.format(Math.abs(diferenca))}
            </div>
          </div>
        )}
      </>
    );
  }
  return (
    <div ref={ref} className="relative h-full w-full">
      {grafico}
    </div>
  );
}

/** Entregas por mês: colunas, o mês atual em acento e a média dos meses anteriores tracejada. */
export function GraficoColunas({ meses, media }: { meses: Array<{ mes: string; rotulo: string; n: number }>; media: number | null }) {
  const [ref, t] = useTamanho<HTMLDivElement>();
  const vals = meses.map((m) => m.n);
  const total = vals.reduce((s, v) => s + v, 0);
  const resumo =
    total === 0
      ? "Nenhuma entrega registrada nos últimos 12 meses"
      : `Entregas por mês nos últimos 12 meses, de ${Math.min(...vals)} a ${Math.max(...vals)}${media !== null ? `, média de ${media.toFixed(1).replace(".", ",")} por mês` : ""}; ${meses.at(-1)?.rotulo} tem ${meses.at(-1)?.n} até hoje`;
  let grafico = null;
  if (t && meses.length > 0) {
    const W = Math.max(220, t.largura);
    const H = Math.max(160, t.altura - 4);
    const B = 22;
    const Tp = 20;
    const { topo } = escalaDoEixo(Math.max(0, ...vals, media ?? 0));
    const bw = W / meses.length;
    const y = (v: number) => H - B - ((H - B - Tp) * v) / topo;
    grafico = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={resumo} className="block overflow-visible">
        <line x1="0" x2={W} y1={H - B} y2={H - B} stroke="var(--color-line)" />
        {meses.map((m, i) => {
          const ultimo = i === meses.length - 1;
          return (
            <g key={m.mes}>
              <rect
                x={i * bw + 3}
                y={y(m.n)}
                width={Math.max(1, bw - 6)}
                height={H - B - y(m.n)}
                rx="3"
                fill={ultimo ? "var(--color-accent)" : "color-mix(in srgb, var(--color-accent) 34%, var(--color-surface))"}
              />
              <text x={i * bw + bw / 2} y={y(m.n) - 6} textAnchor="middle" className={ultimo ? "fill-fg font-mono text-[11px] font-medium" : TEXTO}>
                {m.n}
              </text>
              <text x={i * bw + bw / 2} y={H - 6} textAnchor="middle" className={ultimo ? "fill-fg font-mono text-[11px]" : TEXTO}>
                {m.rotulo}
              </text>
            </g>
          );
        })}
        {media !== null && media > 0 && (
          <line x1="0" x2={W} y1={y(media)} y2={y(media)} stroke="var(--color-fg-mute)" strokeDasharray="3 3" />
        )}
        {total === 0 && (
          <text x={W / 2} y={(Tp + H - B) / 2} textAnchor="middle" className="fill-fg-faint font-sans text-[12.5px]">
            Nenhuma entrega registrada ainda.
          </text>
        )}
      </svg>
    );
  }
  return (
    <div ref={ref} className="relative h-full w-full">
      {grafico}
    </div>
  );
}
