import type { ReactNode } from "react";
import { cn } from "./cn";

export interface Par {
  rotulo: ReactNode;
  valor: ReactNode;
}

/** Rótulo e valor em duas colunas (Plano, Renova, Convidados…): a coluna do rótulo tem largura fixa. */
export function Pares({ itens, className }: { itens: Par[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[13px]", className)}>
      {itens.map((p, i) => (
        // Rótulo pode ser nó; a ordem da lista é fixa por tela.
        <div key={i} className="contents">
          <dt className="text-fg-faint">{p.rotulo}</dt>
          <dd className="min-w-0 text-fg">{p.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
