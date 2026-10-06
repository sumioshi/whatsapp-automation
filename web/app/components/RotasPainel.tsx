"use client";

import { createContext, type ReactNode, useContext } from "react";
import { destinoSemSessao, type ModoPainel, type RotasPainel, rotasPainel } from "@/lib/rotas-painel";

const Ctx = createContext<RotasPainel>(rotasPainel("dono"));

/** Sem provider, os componentes usam as rotas do painel do dono (comportamento de sempre). */
export function RotasPainelProvider({ modo, children }: { modo: ModoPainel; children: ReactNode }) {
  return <Ctx.Provider value={rotasPainel(modo)}>{children}</Ctx.Provider>;
}

export function useRotas(): RotasPainel {
  return useContext(Ctx);
}

let saindo = false;

/**
 * Passa toda resposta das rotas da conversa por aqui: na área de atendimento,
 * 401 (sessão vencida, conta desativada ou senha trocada) leva ao login. No
 * painel do dono não muda nada. Devolve a própria resposta pra encadear.
 */
export function checarSessao(res: Response, rotas: RotasPainel): Response {
  if (saindo || typeof window === "undefined") return res;
  const destino = destinoSemSessao(rotas, res.status, window.location.pathname + window.location.search);
  if (destino) {
    saindo = true;
    window.location.assign(destino);
  }
  return res;
}
