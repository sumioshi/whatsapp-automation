import { GroupWorkspace } from "@/app/components/GroupWorkspace";
import { rotuloTempo, tipoDoSlug } from "@/lib/clientes";
import { conversationName, listGroups, readGroupMessages } from "@/lib/data";
import { readTriage } from "@/lib/triage";

export const dynamic = "force-dynamic";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [messages, groups, triage] = await Promise.all([
    readGroupMessages(slug),
    listGroups(),
    readTriage(),
  ]);
  // DM mostra o nome do contato (senderName das msgs recebidas), não o número/LID.
  const groupName = conversationName(slug, messages.at(-1)?.group ?? slug, messages);
  const g = groups.find((x) => x.slug === slug);

  const contexto = {
    slug,
    nome: g?.name ?? groupName,
    tipo: tipoDoSlug(slug),
    avatarPath: g?.avatarPath ?? null,
    etiquetas: triage.etiquetas[slug] ?? [],
    conhecidas: [...new Set(Object.values(triage.etiquetas).flat())],
    autonomo: Boolean(triage.autonomo[slug]),
    silenciado: Boolean(triage.muted[slug]),
    mensagens: g?.messageCount ?? messages.length,
    atividadeLabel: rotuloTempo(g?.lastTimestamp ?? messages.at(-1)?.timestamp ?? null, Date.now()),
  };

  return (
    <GroupWorkspace slug={slug} groupName={groupName} messages={messages} contexto={contexto} />
  );
}
