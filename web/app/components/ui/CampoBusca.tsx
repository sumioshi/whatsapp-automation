"use client";

import type { Ref } from "react";
import { cn } from "./cn";
import { Icone } from "./Icone";
import { Input } from "./Input";

/** Campo de busca do Balcão: lupa à esquerda, dentro do campo (o `.search` do protótipo). */
export function CampoBusca({
  valor,
  aoMudar,
  placeholder,
  rotulo,
  className,
  ref,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder: string;
  /** Nome para leitor de tela ("Buscar grupos"). */
  rotulo: string;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <div className={cn("relative", className)}>
      <Icone nome="search" tamanho={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-faint" />
      <Input
        ref={ref}
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        aria-label={rotulo}
        autoComplete="off"
        spellCheck={false}
        className="pl-8"
      />
    </div>
  );
}
