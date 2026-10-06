"use client";

import { createContext, type ReactNode, useContext } from "react";
import { type ModoPainel, type RotasPainel, rotasPainel } from "@/lib/rotas-painel";

const Ctx = createContext<RotasPainel>(rotasPainel("dono"));

/** Sem provider, os componentes usam as rotas do painel do dono (comportamento de sempre). */
export function RotasPainelProvider({ modo, children }: { modo: ModoPainel; children: ReactNode }) {
  return <Ctx.Provider value={rotasPainel(modo)}>{children}</Ctx.Provider>;
}

export function useRotas(): RotasPainel {
  return useContext(Ctx);
}
