"use client";

import type { Ref, SelectHTMLAttributes } from "react";
import { cn } from "./cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /** "sm": 28 px e texto de 12,5 px, para seletores dentro de linhas de lista. */
  tamanho?: "sm" | "md";
  ref?: Ref<HTMLSelectElement>;
};

/** A largura vem com o tamanho: md ocupa o campo; sm se ajusta ao texto, para caber na linha. */
const TAMANHOS = {
  sm: "h-7 w-auto px-2 py-0 text-[12.5px]",
  md: "w-full px-2.5 py-1.5 text-sm",
};

export function Select({ className = "", tamanho = "md", children, ...rest }: SelectProps) {
  return (
    <select
      className={cn(
        "focus-ring rounded-control border border-line-2 bg-surface text-fg transition-colors disabled:opacity-60 aria-[invalid=true]:border-danger",
        TAMANHOS[tamanho],
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}
