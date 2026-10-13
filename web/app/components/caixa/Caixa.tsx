"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useRotas } from "../RotasPainel";
import { cn } from "../ui";
import { type DadosCaixa, ListaConversas } from "./ListaConversas";

/**
 * Mesa da Caixa: fila à esquerda e, ao lado, o que a rota abrir (o centro
 * vazio ou a conversa com o painel do cliente). A fila mora no layout, então
 * filtro, vista e rolagem sobrevivem à troca de conversa. No celular é uma
 * coisa de cada vez: a fila em tela cheia ou a conversa com o voltar.
 */
export function Caixa({ dados, aviso, children }: { dados: DadosCaixa; aviso?: ReactNode; children: ReactNode }) {
  const rotas = useRotas();
  const lendo = usePathname() !== rotas.caixa;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] max-[1360px]:grid-cols-[320px_minmax(0,1fr)] max-[860px]:grid-cols-[minmax(0,1fr)]">
      <ListaConversas dados={dados} aviso={aviso} className={cn(lendo && "max-[860px]:hidden")} />
      <div className={cn("flex min-h-0 min-w-0 flex-col", !lendo && "max-[860px]:hidden")}>{children}</div>
    </div>
  );
}
