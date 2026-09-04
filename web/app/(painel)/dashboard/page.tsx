import { montarDashboardAtual } from "@/lib/dashboard-atual";
import { DashboardView } from "./DashboardView";

export const dynamic = "force-dynamic";

/** Visão de negócio por cliente: contrato × atividade × entregas. */
export default async function DashboardPage() {
  const dados = await montarDashboardAtual();
  return <DashboardView dados={dados} />;
}
