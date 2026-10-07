import { notFound } from "next/navigation";
import { Timeline } from "@/app/components/Timeline";
import { conversationName } from "@/lib/data";
import { irmaosLiberados } from "@/lib/equipe/acesso";
import { janelaDaConversa, totalDaConversa } from "@/lib/equipe/conversa";
import { listaDaPagina, paginaDoAtendente } from "@/lib/equipe/pagina";

export const dynamic = "force-dynamic";

/** Conversa sem painel lateral: notas, contrato e copiloto não existem pro atendente. */
export default async function AtendimentoChat({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await paginaDoAtendente();
  if (!p || !p.a.chats.has(slug)) notFound();
  const irmaos = await irmaosLiberados(p.a, slug);
  // A lista vem do mesmo cache da renderização do layout: nada de listGroups de novo.
  const [messages, total, lista] = await Promise.all([
    janelaDaConversa(irmaos, { limit: 150 }),
    totalDaConversa(irmaos),
    listaDaPagina(),
  ]);
  const fallback = conversationName(slug, messages.at(-1)?.group ?? slug, messages);
  const canonico = p.canonicoDe(slug);
  const groupName = lista?.find((x) => x.slug === canonico)?.name ?? fallback;
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <Timeline key={slug} slug={slug} groupName={groupName} messages={messages} total={total} />
    </div>
  );
}
