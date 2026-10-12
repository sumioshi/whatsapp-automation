import type { ReactNode, Ref } from "react";
import { cn } from "./cn";

/**
 * Corpo rolável de uma tela de trabalho, logo abaixo do CabecalhoPagina "barra" (que fica
 * parado): margem da página de 32 px (24 px abaixo de 1020 px, 16 px no celular), largura
 * máxima de 1400 px e 20 px entre blocos (14 px no celular).
 */
export function CorpoPagina({
  children,
  className,
  ref,
}: {
  children: ReactNode;
  className?: string;
  /** O elemento que rola (para navegação por seção). */
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto">
      <div
        className={cn(
          "mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-8 max-[1020px]:p-6 max-[860px]:gap-3.5 max-[860px]:p-4",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
