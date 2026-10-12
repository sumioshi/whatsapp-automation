import Link from "next/link";
import { tipoPeloSlug } from "@/lib/aparencia";
import type { InboxItem as Item, InboxReason } from "@/lib/inbox";
import { AnelEspera, Avatar, Badge } from "@/app/components/ui";

const REASON: Record<InboxReason, { label: string; variant: "danger" | "accent" }> = {
  "client-waiting": { label: "cliente aguardando", variant: "danger" },
  mentioned: { label: "menção", variant: "accent" },
};

/** Uma linha da caixa de entrada: avatar, nome, motivo, tempo de espera e a prévia. */
export function InboxItem({ item, href }: { item: Item; href?: string }) {
  const r = REASON[item.reason];
  return (
    <Link
      href={href ?? `/g/${item.slug}`}
      className="group grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-card border border-line bg-surface px-4 py-3 [box-shadow:var(--shadow-card)] transition-colors hover:border-line-2"
    >
      <Avatar nome={item.groupName} tipo={tipoPeloSlug(item.slug)} tamanho="md" className="row-span-2" />
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold text-fg group-hover:text-accent">{item.groupName}</span>
        <Badge variant={r.variant}>{r.label}</Badge>
      </span>
      <span title={`Aguardando desde ${new Date(item.waitingSince).toLocaleString("pt-BR")}`}>
        <AnelEspera ms={item.waitingMs} />
      </span>
      <p className="col-span-2 line-clamp-2 text-[13.5px] leading-relaxed text-fg-dim">
        <span className="text-fg-faint">{item.who}: </span>
        {item.preview}
      </p>
    </Link>
  );
}
