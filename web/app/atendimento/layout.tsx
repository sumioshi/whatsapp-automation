import { redirect } from "next/navigation";
import { AtendimentoSidebar, AvisoDesconectado } from "@/app/components/AtendimentoSidebar";
import { Caixa } from "@/app/components/caixa/Caixa";
import { RotasPainelProvider } from "@/app/components/RotasPainel";
import { paraConversa, paraEspera } from "@/lib/caixa-dados";
import { listaDaPagina, paginaDoAtendente } from "@/lib/equipe/pagina";
import { buildInbox } from "@/lib/inbox";

export const dynamic = "force-dynamic";

/** A Caixa da equipe: a mesma fila e conversa, só com os chats liberados. */
export default async function AtendimentoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const p = await paginaDoAtendente();
  // Dono (ou sessão inválida) não tem área de atendimento.
  if (!p) redirect("/");
  // Só os chats dele; o "silenciado" é organização do dono e não tira ninguém da fila.
  // DM partida em telefone × LID é avaliada como uma conversa só.
  const [lista, inbox] = await Promise.all([
    listaDaPagina(),
    buildInbox({ slugs: p.a.chats, ignorarSilenciados: true, canonicoDe: p.canonicoDe }),
  ]);
  const conversas = (lista ?? []).map(paraConversa);
  return (
    <RotasPainelProvider modo="atendimento">
      <div className="flex h-dvh overflow-hidden max-[860px]:flex-col-reverse">
        <AtendimentoSidebar nome={p.a.usuario.nome} naoLidas={conversas.filter((c) => c.naoLidas > 0).length} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Caixa
            dados={{ esperando: inbox.map(paraEspera), conversas, entregas: [], aguardandoOk: [], geradoEm: Date.now() }}
            aviso={<AvisoDesconectado />}
          >
            {children}
          </Caixa>
        </main>
      </div>
    </RotasPainelProvider>
  );
}
