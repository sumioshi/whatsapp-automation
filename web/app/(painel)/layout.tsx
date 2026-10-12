import { listGroups } from "@/lib/data";
import { CommandPalette } from "../components/CommandPalette";
import { ListaConversas } from "../components/ListaConversas";
import { Trilho } from "../components/Trilho";

export const dynamic = "force-dynamic";

export default async function PainelLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const groups = await listGroups();
  const usuario = process.env.PANEL_USER?.trim() || "você";
  return (
    <>
      {/* Desktop: trilho | conversas | conteúdo. Celular: conteúdo em cima, trilho vira barra embaixo. */}
      <div className="flex h-dvh overflow-hidden max-[860px]:flex-col-reverse">
        <Trilho groups={groups} usuario={usuario} />
        <ListaConversas groups={groups} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      </div>
      <CommandPalette groups={groups} />
    </>
  );
}
