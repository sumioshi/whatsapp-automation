import { redirect } from "next/navigation";
import { RotasPainelProvider } from "@/app/components/RotasPainel";
import { AtendimentoSidebar } from "@/app/components/AtendimentoSidebar";
import { listaDaPagina, paginaDoAtendente } from "@/lib/equipe/pagina";

export const dynamic = "force-dynamic";

export default async function AtendimentoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const p = await paginaDoAtendente();
  // Dono (ou sessão inválida) não tem área de atendimento.
  if (!p) redirect("/");
  const groups = (await listaDaPagina()) ?? [];
  return (
    <RotasPainelProvider modo="atendimento">
      <div className="flex h-screen overflow-hidden">
        <AtendimentoSidebar groups={groups} nome={p.a.usuario.nome} />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </RotasPainelProvider>
  );
}
