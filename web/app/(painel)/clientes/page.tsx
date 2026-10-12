import { buildClientes } from "@/lib/clientes";
import { readKanban } from "@/lib/kanban-store";
import { ClientesView } from "./ClientesView";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const [linhas, kanban] = await Promise.all([buildClientes(), readKanban()]);
  // O relógio do servidor vale para a tela toda: o HTML e a hidratação mostram as mesmas datas.
  return <ClientesView linhas={linhas} kanban={kanban} agoraMs={Date.now()} />;
}
