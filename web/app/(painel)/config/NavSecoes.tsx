"use client";

import { cn, Icone } from "@/app/components/ui";
import { type IdSecao, type Resumo, SECOES } from "./secoes";

/** Contagens ("21/201", "7") vão em mono; palavras ("desligado", "15 min") ficam na fonte de texto. */
const SO_NUMERO = /^[\d.,/ ]+$/;

const TOM_RESUMO: Record<NonNullable<Resumo["tom"]>, string> = {
  ok: "text-ok",
  danger: "text-danger",
  accent: "text-accent",
};

/**
 * Navegação das seções de Configurações. No computador, coluna parada à esquerda com o estado
 * curto de cada seção; no celular, faixa de pílulas presa no topo, que rola para o lado.
 */
export function NavSecoes({
  ativa,
  resumos,
  aoIr,
}: {
  ativa: IdSecao;
  resumos: Partial<Record<IdSecao, Resumo>>;
  aoIr: (id: IdSecao) => void;
}) {
  const grupos = [...new Set(SECOES.map((s) => s.grupo))];
  const clicar = (id: IdSecao) => (e: React.MouseEvent) => {
    e.preventDefault();
    aoIr(id);
  };

  return (
    <nav aria-label="Seções das configurações" className="sticky top-0 z-10 min-[1021px]:top-8">
      {/* Computador: lista agrupada. */}
      <div className="flex flex-col gap-4 max-[1020px]:hidden">
        {grupos.map((grupo) => (
          <div key={grupo}>
            <p className="mb-1 px-2.5 text-[12px] font-medium text-fg-faint">{grupo}</p>
            <ul className="flex flex-col gap-0.5">
              {SECOES.filter((s) => s.grupo === grupo).map((s) => {
                const atual = s.id === ativa;
                const resumo = resumos[s.id];
                return (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      onClick={clicar(s.id)}
                      aria-current={atual ? "true" : undefined}
                      className={cn(
                        "focus-ring relative flex h-9 items-center gap-2.5 rounded-control px-2.5 text-[13px] transition-colors",
                        atual ? "bg-selected font-medium text-fg" : "text-fg-dim hover:bg-elevated hover:text-fg",
                      )}
                    >
                      {atual && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-0.5 rounded-r-full bg-accent" />}
                      <Icone nome={s.icone} className={atual ? "text-accent" : "text-fg-faint"} />
                      <span className="min-w-0 flex-1 truncate">{s.rotulo}</span>
                      {resumo && (
                        <span
                          className={cn(
                            "shrink-0",
                            SO_NUMERO.test(resumo.texto) ? "font-mono text-[11.5px] tabular-nums" : "text-[12px]",
                            resumo.tom ? TOM_RESUMO[resumo.tom] : "text-fg-faint",
                          )}
                        >
                          {resumo.texto}
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Celular e janela estreita: pílulas que rolam para o lado. */}
      <div className="-mx-6 hidden gap-1.5 overflow-x-auto border-b border-line bg-bg px-6 py-2 [scrollbar-width:none] max-[1020px]:flex max-[860px]:-mx-4 max-[860px]:px-4">
        {SECOES.map((s) => {
          const atual = s.id === ativa;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={clicar(s.id)}
              aria-current={atual ? "true" : undefined}
              className={cn(
                "focus-ring inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors",
                atual ? "bg-ink text-on-ink" : "bg-surface text-fg-dim shadow-[inset_0_0_0_1px_var(--color-line)] hover:text-fg",
              )}
            >
              {s.rotulo}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
