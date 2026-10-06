import { redirect } from "next/navigation";
import { RotasPainelProvider } from "@/app/components/RotasPainel";
import { AtendimentoSidebar } from "@/app/components/AtendimentoSidebar";
import { listGroups } from "@/lib/data";
import { atendenteDaPagina } from "@/lib/equipe/acesso";
import { listaDoAtendente } from "@/lib/equipe/lista";
import { lerVisto } from "@/lib/equipe/visto";

export const dynamic = "force-dynamic";

export default async function AtendimentoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const a = await atendenteDaPagina();
  // Dono (ou sessão inválida) não tem área de atendimento.
  if (!a) redirect("/");
  const grupos = await listGroups({ lastSeen: await lerVisto(a.usuario.login) });
  return (
    <RotasPainelProvider modo="atendimento">
      <div className="flex h-screen overflow-hidden">
        <AtendimentoSidebar groups={listaDoAtendente(grupos, a.chats)} nome={a.usuario.nome} />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </RotasPainelProvider>
  );
}
