"use client";

import { type CSSProperties, useState } from "react";
import { corDoMatiz, iniciais, matizDoNome } from "@/lib/aparencia";
import { cn } from "./cn";

type Tamanho = "xs" | "sm" | "md" | "lg";

const TAMANHO: Record<Tamanho, string> = {
  xs: "h-[22px] w-[22px] text-[9.5px]",
  sm: "h-7 w-7 text-[10.5px]",
  md: "h-9 w-9 text-[12.5px]",
  lg: "h-10 w-10 text-[13px]",
};

const RAIO_GRUPO: Record<Tamanho, string> = {
  xs: "rounded-[6px]",
  sm: "rounded-[8px]",
  md: "rounded-[10px]",
  lg: "rounded-[10px]",
};

export interface AvatarProps {
  nome: string;
  /** Grupo é quadrado arredondado; conversa direta é círculo. */
  tipo?: "grupo" | "dm";
  /** URL já resolvida da foto (rotas.midia(avatarPath)). Sem foto, ou se falhar, mostra as iniciais. */
  fotoUrl?: string | null;
  tamanho?: Tamanho;
  className?: string;
  /** true quando o nome já aparece escrito ao lado (o avatar some para o leitor de tela). */
  decorativo?: boolean;
}

export function Avatar({ nome, tipo = "grupo", fotoUrl, tamanho = "md", className, decorativo = true }: AvatarProps) {
  const [falhou, setFalhou] = useState(false);
  const forma = tipo === "dm" ? "rounded-full" : RAIO_GRUPO[tamanho];

  if (fotoUrl && !falhou) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fotoUrl}
        alt={decorativo ? "" : nome}
        aria-hidden={decorativo || undefined}
        onError={() => setFalhou(true)}
        className={cn(TAMANHO[tamanho], forma, "shrink-0 border border-line object-cover", className)}
      />
    );
  }

  return (
    <span
      aria-hidden={decorativo || undefined}
      aria-label={decorativo ? undefined : nome}
      role={decorativo ? undefined : "img"}
      style={{ "--hue": corDoMatiz(matizDoNome(nome)) } as CSSProperties}
      className={cn("avatar-matiz grid shrink-0 select-none place-items-center font-semibold leading-none", TAMANHO[tamanho], forma, className)}
    >
      {iniciais(nome)}
    </span>
  );
}
