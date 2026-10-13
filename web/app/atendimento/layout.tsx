import { redirect } from "next/navigation";
import { AtendimentoSidebar, AvisoDesconectado } from "@/app/components/AtendimentoSidebar";
import { Caixa } from "@/app/components/caixa/Caixa";
import { RotasPainelProvider } from "@/app/components/RotasPainel";
import { filaDaEquipe } from "@/lib/caixa-dados";
import { listaDaPagina, paginaDoAtendente } from "@/lib/equipe/pagina";

export const dynamic = "force-dynamic";

/** A Caixa da equipe: a mesma fila e conversa, só com os chats liberados. */
export default async function AtendimentoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const p = await paginaDoAtendente();
  // Dono (ou sessão inválida) não tem área de atendimento.
  if (!p) redirect("/");
  const dados = await filaDaEquipe(p.a.chats, p.canonicoDe, (await listaDaPagina()) ?? []);
  return (
    <RotasPainelProvider modo="atendimento">
      <div className="flex h-dvh overflow-hidden max-[860px]:flex-col-reverse">
        <AtendimentoSidebar nome={p.a.usuario.nome} naoLidas={dados.conversas.filter((c) => c.naoLidas > 0).length} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Caixa dados={dados} aviso={<AvisoDesconectado />}>
            {children}
          </Caixa>
        </main>
      </div>
    </RotasPainelProvider>
  );
}
