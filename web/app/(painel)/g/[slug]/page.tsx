import { GroupWorkspace } from "@/app/components/GroupWorkspace";
import { conversationName, readGroupMessages } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const messages = await readGroupMessages(slug);
  // DM mostra o nome do contato (senderName das msgs recebidas), não o número/LID.
  const groupName = conversationName(slug, messages.at(-1)?.group ?? slug, messages);

  return <GroupWorkspace slug={slug} groupName={groupName} messages={messages} />;
}
