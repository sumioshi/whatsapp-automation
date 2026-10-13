import Link from "next/link";
import { type CSSProperties, Fragment, type ReactNode } from "react";
import { Avatar, Badge, cn } from "@/app/components/ui";
import { corDoMatiz, matizDoNome, tipoPeloSlug } from "@/lib/aparencia";
import { arcosDaRosca, nivelDoCalor } from "@/lib/graficos";
import { type Painel, partesDoTempo, type QuemRespondeu, type Rodape } from "@/lib/painel";
import { rotasPainel } from "@/lib/rotas-painel";
import { Icone, type NomeIcone } from "../_hoje/icones";
import { FOCO } from "../_hoje/pecas";

const rotas = rotasPainel("dono");
const numero = new Intl.NumberFormat("pt-BR");

// ── Indicadores ────────────────────────────────────────────────────────────

const TOM_CHIP = { ok: "ok", atencao: "warn", neutro: "neutral" } as const;

/** Número grande, a variação embaixo e as barrinhas dos últimos dias à direita. */
export function Indicador({ grande, rodape, barras }: { grande: ReactNode; rodape: Rodape; barras: ReactNode }) {
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
      <div className="min-w-0">
        <div className="whitespace-nowrap text-[34px] font-semibold leading-none tracking-[-0.03em] text-fg tabular-nums">{grande}</div>
        <div className="mt-3 flex items-center gap-2 whitespace-nowrap text-[12.5px] text-fg-faint">
          {rodape.chip && (
            <Badge variant={TOM_CHIP[rodape.chip.tom]} className="font-mono tabular-nums">
              {rodape.chip.texto}
            </Badge>
          )}
          <span className="truncate">{rodape.texto}</span>
        </div>
      </div>
      <div className="max-[860px]:hidden">{barras}</div>
    </div>
  );
}

/** Unidade depois do número grande ("18min", "11 de 14"). */
export function UnidadeGrande({ children }: { children: ReactNode }) {
  return <span className="ml-0.5 text-[20px] font-medium tracking-[-0.01em] text-fg-dim">{children}</span>;
}

export function TempoGrande({ ms }: { ms: number | null }) {
  if (ms === null) return <>—</>;
  return (
    <>
      {partesDoTempo(ms).map((p, i) => (
        <Fragment key={p.unidade}>
          {i > 0 && " "}
          {p.valor}
          <UnidadeGrande>{p.unidade}</UnidadeGrande>
        </Fragment>
      ))}
    </>
  );
}

/** Barrinhas do indicador: a última cheia, as outras esmaecidas. Decorativas (o número está ao lado). */
export function Barrinhas({ valores, cor }: { valores: number[]; cor: string }) {
  const W = 112;
  const H = 44;
  const maior = Math.max(1, ...valores);
  const bw = W / Math.max(1, valores.length);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="block overflow-visible">
      {valores.map((v, i) => {
        const h = Math.max(3, (v / maior) * H);
        return (
          <rect
            // A posição é a identidade da barra: o dia não muda de lugar.
            key={i}
            x={i * bw + 1}
            y={H - h}
            width={Math.max(1, bw - 2.5)}
            height={h}
            rx="1.5"
            fill={cor}
            fillOpacity={i === valores.length - 1 ? 1 : 0.35}
          />
        );
      })}
    </svg>
  );
}

// ── Tempo da primeira resposta ─────────────────────────────────────────────

/** A régua da espera: verde é rápido, âmbar depois de 30 min, vermelho passou de 4 h. */
const COR_FAIXA = [
  "var(--color-ok)",
  "color-mix(in srgb, var(--color-ok) 55%, var(--color-surface))",
  "color-mix(in srgb, var(--color-warn-mark) 55%, var(--color-surface))",
  "var(--color-warn-mark)",
  "var(--color-danger)",
];

export function FaixasResposta({ faixas, total }: { faixas: Painel["faixas"]; total: number }) {
  if (total === 0) return <p className="pt-16 text-center text-[12.5px] text-fg-faint">Nenhuma resposta no período.</p>;
  const maior = Math.max(1, ...faixas.map((f) => f.pct));
  return (
    <>
      {faixas.map((f, i) => (
        <div
          key={f.id}
          style={{ "--c": COR_FAIXA[i] } as CSSProperties}
          className="grid h-10 grid-cols-[100px_minmax(0,1fr)_40px] items-center gap-3 text-[13px]"
        >
          <span className="flex items-center gap-2 whitespace-nowrap text-fg-dim">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px] bg-[var(--c)]" />
            {f.rotulo}
          </span>
          <span role="img" aria-label={`${f.rotulo}: ${f.pct}%, ${f.n} respostas`} className="relative h-2.5 overflow-hidden rounded-[5px] bg-elevated">
            <i className="absolute inset-y-0 left-0 rounded-[5px] bg-[var(--c)]" style={{ width: `${(f.pct / maior) * 100}%` }} />
          </span>
          <span className="text-right font-mono text-[12.5px] font-medium tabular-nums">{f.pct}%</span>
        </div>
      ))}
      <p className="mt-2 text-[12px] text-fg-faint">Do recebimento à primeira resposta sua, da equipe ou da IA.</p>
    </>
  );
}

// ── Quem respondeu ─────────────────────────────────────────────────────────

const ESTILO_QUEM: Record<QuemRespondeu, { cor: string; icone: NomeIcone; dica: string }> = {
  celular: { cor: "var(--color-id-celular)", icone: "celular", dica: "você no celular ou no WhatsApp Web" },
  painel: { cor: "var(--color-id-painel)", icone: "monitor", dica: "você aqui no Balcão" },
  equipe: { cor: "var(--color-id-equipe)", icone: "pessoa", dica: "alguém da equipe, pelo painel ou no grupo" },
  ia: { cor: "var(--color-id-ia)", icone: "ia", dica: "a IA, com ritmo humano" },
  "sem-registro": { cor: "var(--color-fg-mute)", icone: "historico", dica: "você, em mensagens de antes do registro de quem enviou" },
};

export function QuemRespondeuRosca({ quem }: { quem: Painel["quem"] }) {
  const total = quem.reduce((s, q) => s + q.n, 0);
  const R = 60;
  const arcos = arcosDaRosca(
    quem.map((q) => q.n),
    R,
    3,
  );
  const contorno = 2 * Math.PI * R;
  return (
    <div className="grid h-full grid-cols-[auto_minmax(0,1fr)] items-center gap-6 max-[480px]:grid-cols-1 max-[480px]:justify-items-center">
      <svg
        width="160"
        height="160"
        viewBox="0 0 160 160"
        role="img"
        aria-label={`Quem respondeu primeiro: ${quem.map((q) => `${q.rotulo} ${q.pct}%`).join(", ")}`}
        className="shrink-0"
      >
        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--color-elevated)" strokeWidth="20" />
        {quem.map((q, i) => {
          const a = arcos[i];
          return a ? (
            <circle
              key={q.id}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={ESTILO_QUEM[q.id].cor}
              strokeWidth="20"
              strokeDasharray={`${a.traco.toFixed(1)} ${contorno.toFixed(1)}`}
              strokeDashoffset={a.deslocamento.toFixed(1)}
              transform="rotate(-90 80 80)"
            />
          ) : null;
        })}
        <text x="80" y="80" textAnchor="middle" className="fill-fg font-sans text-[24px] font-semibold tracking-[-0.02em]">
          {numero.format(total)}
        </text>
        <text x="80" y="99" textAnchor="middle" className="fill-fg-faint font-sans text-[11.5px]">
          {total === 1 ? "resposta" : "respostas"}
        </text>
      </svg>
      <div className="flex min-w-0 flex-col justify-center gap-1 self-stretch max-[480px]:w-full">
        {quem.map((q) => {
          const e = ESTILO_QUEM[q.id];
          return (
            <div
              key={q.id}
              title={e.dica}
              style={{ "--c": e.cor } as CSSProperties}
              className="grid h-10 grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-line text-[13px] last:border-b-0"
            >
              <span className="grid h-[22px] w-[22px] place-items-center rounded-[6px] bg-[color-mix(in_srgb,var(--c)_var(--tint),var(--color-surface))] text-[var(--c)]">
                <Icone nome={e.icone} className="h-[13px] w-[13px]" />
              </span>
              <b className="truncate font-medium">{q.rotulo}</b>
              <span className="font-mono text-[12.5px] font-medium tabular-nums">
                {q.pct}%<small className="ml-1.5 font-normal text-fg-faint">{numero.format(q.n)}</small>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Clientes mais ativos ───────────────────────────────────────────────────

export function MaisAtivos({ itens }: { itens: Painel["maisAtivos"] }) {
  if (itens.length === 0) return <p className="pt-16 text-center text-[12.5px] text-fg-faint">Nenhuma mensagem de cliente no período.</p>;
  const maior = Math.max(1, ...itens.map((c) => c.n));
  return (
    <ol>
      {itens.map((c) => (
        <li key={c.slug}>
          <Link
            href={rotas.chat(c.slug)}
            style={{ "--hue": corDoMatiz(matizDoNome(c.nome)) } as CSSProperties}
            className={cn("group relative isolate mb-1.5 flex h-10 items-center gap-2.5 rounded-[8px] pl-2 pr-3 text-[13px]", FOCO)}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 -z-10 rounded-[8px] bg-[color-mix(in_srgb,var(--hue)_var(--tint),var(--color-surface))]"
              style={{ width: `calc((100% - 52px) * ${(c.n / maior).toFixed(3)} + 36px)` }}
            />
            <Avatar
              nome={c.nome}
              tipo={tipoPeloSlug(c.slug)}
              fotoUrl={c.avatarPath ? rotas.midia(c.avatarPath) : null}
              tamanho="xs"
              className="!bg-surface"
            />
            <b className="min-w-0 flex-1 truncate font-medium group-hover:text-accent">{c.nome}</b>
            <span className="font-mono text-[12.5px] font-medium tabular-nums">{numero.format(c.n)}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

// ── Quando os clientes escrevem ────────────────────────────────────────────

const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const TOM_CALOR = [8, 22, 42, 66, 100];

function corDoNivel(nivel: number): string {
  return nivel === 0 ? "var(--color-elevated)" : `color-mix(in srgb, var(--color-accent) ${TOM_CALOR[nivel - 1]}%, var(--color-surface))`;
}

export function EscalaCalor() {
  return (
    <span className="flex items-center gap-1 text-[11.5px] text-fg-faint">
      menos
      {TOM_CALOR.map((_, i) => (
        <i key={i} aria-hidden className="inline-block h-3 w-3 rounded-[3px]" style={{ background: corDoNivel(i + 1) }} />
      ))}
      mais
    </span>
  );
}

export function MapaCalor({ calor }: { calor: number[][] }) {
  const maior = Math.max(0, ...calor.flat());
  return (
    <div className="overflow-x-auto">
      <div
        role="img"
        aria-label={`Mensagens de clientes por dia da semana e hora${maior === 0 ? ": nenhuma no período" : ""}`}
        className={cn("grid min-w-[560px] grid-cols-[36px_repeat(24,minmax(0,1fr))] items-center gap-[3px]")}
      >
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="font-mono text-[10px] leading-none text-fg-faint">
            {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
          </span>
        ))}
        {calor.map((linha, d) => (
          <Fragment key={DIAS[d]}>
            <span className="text-[11.5px] text-fg-faint">{DIAS[d]}</span>
            {linha.map((n, h) => (
              <span
                // A hora é a identidade da célula.
                key={h}
                title={`${DIAS[d]}, ${String(h).padStart(2, "0")}h: ${numero.format(n)} ${n === 1 ? "mensagem" : "mensagens"}`}
                className="aspect-[1.6] rounded-[4px]"
                style={{ background: corDoNivel(nivelDoCalor(n, maior)) }}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
