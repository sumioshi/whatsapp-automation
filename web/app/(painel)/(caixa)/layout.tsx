import { Caixa } from "@/app/components/caixa/Caixa";
import { filaDoDono } from "@/lib/caixa-dados";

export const dynamic = "force-dynamic";

/** A fila da Caixa fica no layout: /inbox e /g/[slug] dividem a mesma coluna. */
export default async function CaixaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <Caixa dados={await filaDoDono()}>{children}</Caixa>;
}
