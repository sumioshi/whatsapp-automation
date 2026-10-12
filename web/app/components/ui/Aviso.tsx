"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icone } from "./Icone";

type Tom = "info" | "ok" | "erro";

const TOM: Record<Tom, string> = {
  info: "border-accent-line bg-accent-soft text-fg",
  ok: "border-ok/30 bg-ok-bg text-fg",
  erro: "border-danger/30 bg-danger-bg text-danger",
};

/**
 * Faixa de retorno de uma ação ("Conta criada", senha gerada, falha ao salvar): fundo tingido
 * pelo tom, texto, ações opcionais e o botão de fechar. Erro é anunciado na hora (alert);
 * o resto, como status.
 */
export function Aviso({
  tom = "info",
  children,
  acoes,
  aoFechar,
  className,
}: {
  tom?: Tom;
  children: ReactNode;
  acoes?: ReactNode;
  aoFechar?: () => void;
  className?: string;
}) {
  return (
    <div
      role={tom === "erro" ? "alert" : "status"}
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border px-4 py-2.5 text-[13px] leading-relaxed", TOM[tom], className)}
    >
      <div className="min-w-0 flex-1 basis-[240px]">{children}</div>
      {(acoes || aoFechar) && (
        <div className="flex shrink-0 items-center gap-1.5">
          {acoes}
          {aoFechar && (
            <button
              type="button"
              onClick={aoFechar}
              aria-label="Fechar aviso"
              className="focus-ring grid h-7 w-7 place-items-center rounded-control text-current opacity-70 transition-opacity hover:opacity-100"
            >
              <Icone nome="x" tamanho={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
