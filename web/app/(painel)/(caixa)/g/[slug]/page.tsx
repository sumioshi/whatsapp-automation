import { GroupWorkspace } from "@/app/components/GroupWorkspace";
import { conversasDaRequisicao } from "@/lib/caixa-dados";
import { conversationName, readGroupMessages, readGroupRecords } from "@/lib/data";
import { dadosDoPainel } from "@/lib/painel-cliente";
import { readTriage } from "@/lib/triage";

export const dynamic = "force-dynamic";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Janela como no WhatsApp: só as últimas 150 vão no HTML, o resto pagina sob
  // demanda. Os registros inteiros (em cache) alimentam o painel do cliente.
  const [messages, registros, groups, triage] = await Promise.all([
    readGroupMessages(slug, { limit: 150 }),
    readGroupRecords(slug),
    conversasDaRequisicao(),
    readTriage(),
  ]);
  // Conversa direta mostra o nome do contato (das mensagens recebidas), não o número.
  const groupName = conversationName(slug, messages.at(-1)?.group ?? slug, messages);
  const g = groups.find((x) => x.slug === slug);
  const painel = await dadosDoPainel(
    { slug, nome: g?.name ?? groupName, avatarPath: g?.avatarPath ?? null, registros },
    triage,
  );

  return (
    <GroupWorkspace
      key={slug}
      slug={slug}
      groupName={g?.name ?? groupName}
      messages={messages}
      total={registros.length}
      painel={painel}
      agora={Date.now()}
      donoLogin={process.env.PANEL_USER?.trim() || null}
    />
  );
}
