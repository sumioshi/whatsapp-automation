import type { ReactNode } from "react";
import { medidaDoUso } from "@/lib/aparencia";
import { cn } from "./cn";

export interface MedidorUsoProps {
  /** O que está sendo medido ("Mensagens em 30 dias") ou o nome do cliente. */
  rotulo?: ReactNode;
  /** Avatar antes do rótulo, quando a linha é um cliente. */
  avatar?: ReactNode;
  valor: number;
  /** Sem limite (cliente sem contrato), mostra só o texto "sem limite". */
  limite: number | null;
  /** Texto para leitor de tela; padrão: rótulo em texto ou "Uso do contrato". */
  rotuloAcessivel?: string;
  /** "compacto": sem margem e com o topo mais junto, para caber numa célula de tabela. */
  compacto?: boolean;
  className?: string;
}

/** Uso contra um limite: azul até o limite, âmbar no que passa dele e a marca do limite na trilha. */
export function MedidorUso({ rotulo, avatar, valor, limite, rotuloAcessivel, compacto, className }: MedidorUsoProps) {
  if (limite === null || !(limite > 0)) {
    return <span className={cn("text-[12.5px] text-fg-mute", className)}>sem limite</span>;
  }
  const { cheio, excesso, marca } = medidaDoUso(valor, limite);
  const nome = rotuloAcessivel ?? (typeof rotulo === "string" ? rotulo : "Uso do contrato");
  return (
    <div className={cn("min-w-0", className)}>
      <div
        className={cn(
          "flex items-baseline justify-between gap-2 text-[12.5px] text-fg-dim",
          compacto ? "mb-1" : "mb-[7px]",
        )}
      >
        {rotulo !== undefined &&
          (avatar ? (
            <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-fg">
              {avatar}
              <span className="truncate">{rotulo}</span>
            </span>
          ) : (
            <span className="min-w-0 truncate">{rotulo}</span>
          ))}
        {/* Sem rótulo (célula de tabela), o número fica à esquerda, sobre o começo da barra. */}
        <span className={cn("whitespace-nowrap font-mono tabular-nums text-fg-faint", rotulo !== undefined && "ml-auto")}>
          <b className="font-medium text-fg">{valor}</b> de {limite}
        </span>
      </div>
      <div role="img" aria-label={`${nome}: ${valor} de ${limite}`} className="relative h-1.5 rounded-[3px] bg-elevated">
        <span className="absolute inset-y-0 left-0 rounded-l-[3px] bg-accent" style={{ width: `${cheio}%` }} />
        {excesso > 0 && (
          <span className="absolute inset-y-0 rounded-r-[3px] bg-warn-mark" style={{ left: `${cheio}%`, width: `${excesso}%` }} />
        )}
        <span className="absolute -inset-y-[3px] w-px bg-fg-dim" style={{ left: `${marca}%` }} />
      </div>
    </div>
  );
}
