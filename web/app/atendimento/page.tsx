import { notFound } from "next/navigation";
import { CentroVazio } from "@/app/components/caixa/CentroVazio";
import { paginaDoAtendente } from "@/lib/equipe/pagina";

export const dynamic = "force-dynamic";

/** Caixa da equipe sem conversa aberta: a fila (no layout) e o centro orientando a escolher uma. */
export default async function AtendimentoInicio() {
  const p = await paginaDoAtendente();
  if (!p) notFound();
  return <CentroVazio />;
}
