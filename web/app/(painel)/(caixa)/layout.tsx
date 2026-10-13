import { Caixa } from "@/app/components/caixa/Caixa";
import { conversasDaRequisicao, iaDaCaixa, paraConversa, paraEspera } from "@/lib/caixa-dados";
import { buildInbox } from "@/lib/inbox";

export const dynamic = "force-dynamic";

/** A fila da Caixa fica no layout: /inbox e /g/[slug] dividem a mesma coluna. */
export default async function CaixaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [inbox, grupos, ia] = await Promise.all([buildInbox(), conversasDaRequisicao(), iaDaCaixa()]);
  return (
    <Caixa
      dados={{
        esperando: inbox.map(paraEspera),
        conversas: grupos.map(paraConversa),
        entregas: ia.entregas,
        aguardandoOk: ia.aguardandoOk,
        geradoEm: Date.now(),
      }}
    >
      {children}
    </Caixa>
  );
}
