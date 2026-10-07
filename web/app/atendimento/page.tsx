import { notFound } from "next/navigation";
import { InboxItem } from "@/app/(painel)/inbox/InboxItem";
import { EmptyState } from "@/app/components/ui";
import { paginaDoAtendente } from "@/lib/equipe/pagina";
import { buildInbox } from "@/lib/inbox";

export const dynamic = "force-dynamic";

export default async function AtendimentoInicio() {
  const p = await paginaDoAtendente();
  if (!p) notFound();
  // Só os chats dele; o "silenciado" é organização do dono e não tira ninguém da fila.
  // DM partida em telefone × LID é avaliada como uma conversa só.
  const items = await buildInbox({ slugs: p.a.chats, ignorarSilenciados: true, canonicoDe: p.canonicoDe });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line bg-surface px-5 py-3">
        <h1 className="font-medium text-fg">Aguardando resposta</h1>
        <span className="mono text-[11px] text-fg-faint">
          {items.length === 0 ? "tudo em dia" : `${items.length} · mais antigo primeiro`}
        </span>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-10">
        {items.length === 0 ? (
          <EmptyState title="Fila limpa" description="Nenhum cliente esperando nos seus chats." className="mt-12" />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-2.5">
            {items.map((item) => (
              <InboxItem key={`${item.slug}-${item.timestamp}`} item={item} href={`/atendimento/g/${item.slug}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
