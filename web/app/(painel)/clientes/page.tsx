import { buildClientes } from "@/lib/clientes";
import { readKanban } from "@/lib/kanban-store";
import { ClientesView } from "./ClientesView";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const [cards, kanban] = await Promise.all([buildClientes(), readKanban()]);
  const aguardando = cards.filter((c) => c.aguardando && !c.silenciado).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line bg-surface px-5 py-3">
        <h1 className="font-medium text-fg">Clientes</h1>
        <span className="mono text-[11px] text-fg-faint">
          {cards.length} {cards.length === 1 ? "conversa" : "conversas"}
          {aguardando > 0 && ` · ${aguardando} aguardando resposta`}
        </span>
      </header>
      <ClientesView cards={cards} kanban={kanban} />
    </div>
  );
}
