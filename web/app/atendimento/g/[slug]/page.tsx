import { notFound } from "next/navigation";
import { Timeline } from "@/app/components/Timeline";
import { conversationName, listGroups } from "@/lib/data";
import { atendenteDaPagina, irmaosLiberados } from "@/lib/equipe/acesso";
import { janelaDaConversa, totalDaConversa } from "@/lib/equipe/conversa";
import { lerVisto } from "@/lib/equipe/visto";

export const dynamic = "force-dynamic";

/** Conversa sem painel lateral: notas, contrato e copiloto não existem pro atendente. */
export default async function AtendimentoChat({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await atendenteDaPagina();
  if (!a || !a.chats.has(slug)) notFound();
  const irmaos = await irmaosLiberados(a, slug);
  const [messages, total, groups] = await Promise.all([
    janelaDaConversa(irmaos, { limit: 150 }),
    totalDaConversa(irmaos),
    listGroups({ lastSeen: await lerVisto(a.usuario.login) }),
  ]);
  const fallback = conversationName(slug, messages.at(-1)?.group ?? slug, messages);
  const groupName = groups.find((x) => x.slug === slug)?.name ?? fallback;
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <Timeline key={slug} slug={slug} groupName={groupName} messages={messages} total={total} />
    </div>
  );
}
