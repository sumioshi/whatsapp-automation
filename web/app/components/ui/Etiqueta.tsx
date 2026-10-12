import type { CSSProperties } from "react";
import { corDoMatiz, matizDaEtiqueta } from "@/lib/aparencia";
import { cn } from "./cn";

/** Pílula com ponto de cor fixa por etiqueta (Bug, Contrato, Proposta…); as outras ganham cor pelo nome. */
export function Etiqueta({ nome, tamanho = "md", className }: { nome: string; tamanho?: "sm" | "md"; className?: string }) {
  return (
    <span
      style={{ "--hue": corDoMatiz(matizDaEtiqueta(nome)) } as CSSProperties}
      className={cn("etiqueta", tamanho === "sm" && "etiqueta-sm", className)}
    >
      {nome}
    </span>
  );
}
