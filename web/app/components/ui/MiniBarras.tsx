import { barrasDaAtividade } from "@/lib/aparencia";
import { cn } from "./cn";

export interface MiniBarrasProps {
  /** Um valor por dia, do mais antigo ao mais recente. */
  valores: number[];
  /** Mensagens por dia que o contrato comporta; dia acima dele em 15% fica âmbar. */
  limiteDiario?: number;
  /** Descrição para leitor de tela ("Atividade nos últimos 30 dias: 412 mensagens"). */
  rotulo: string;
  className?: string;
}

/** Atividade diária em barras de 3 px, para caber numa linha de tabela. */
export function MiniBarras({ valores, limiteDiario, rotulo, className }: MiniBarrasProps) {
  return (
    <span role="img" aria-label={rotulo} className={cn("flex h-5 items-end gap-px", className)}>
      {barrasDaAtividade(valores, { altura: 20, limiteDiario }).map((b, i) => (
        <i
          // A posição é a identidade da barra: o dia não muda de lugar.
          key={i}
          className={cn(
            "w-[3px] rounded-t-[1px]",
            b.acima ? "bg-warn-mark" : "bg-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-surface))]",
          )}
          style={{ height: `${b.altura}px` }}
        />
      ))}
    </span>
  );
}
