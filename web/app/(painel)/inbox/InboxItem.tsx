import Link from "next/link";
import type { InboxItem as Item, InboxReason } from "@/lib/inbox";
import { Badge } from "@/app/components/ui";
import { BAND_LABEL_CLASS, BAND_BORDER_CLASS } from "@/lib/sla";

const REASON: Record<InboxReason, { label: string; variant: "danger" | "info" }> = {
  "client-waiting": { label: "cliente aguardando", variant: "danger" },
  mentioned: { label: "menção", variant: "info" },
};

/** Uma linha da caixa de entrada: clicável pro grupo, com motivo, prévia, horário e urgência. */
export function InboxItem({ item }: { item: Item }) {
  const r = REASON[item.reason];
  const labelClass = BAND_LABEL_CLASS[item.band];
  const borderClass = BAND_BORDER_CLASS[item.band];

  return (
    <Link
      href={`/g/${item.slug}`}
      className={[
        "group block rounded-card border border-line bg-surface px-4 py-3",
        "border-l-2 transition-colors hover:border-line-2",
        borderClass,
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        {/* Avatar inicial */}
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] border border-line bg-surface-2 text-[11px] font-semibold text-fg-dim">
          {item.groupName.slice(0, 2).toUpperCase()}
        </span>

        {/* Nome do grupo */}
        <span className="min-w-0 flex-1 truncate font-medium text-fg group-hover:text-accent-2">
          {item.groupName}
        </span>

        {/* Badge de motivo */}
        <Badge variant={r.variant} dot>
          {r.label}
        </Badge>

        {/* Rótulo de urgência */}
        <span
          className={["mono shrink-0 text-[11px]", labelClass].join(" ")}
          title={`Aguardando desde ${new Date(item.waitingSince).toLocaleString("pt-BR")}`}
          aria-label={`Aguardando ${item.waitingLabel}`}
        >
          {item.waitingLabel}
        </span>
      </div>

      {/* Prévia */}
      <p className="mt-1.5 line-clamp-2 pl-10 text-sm leading-relaxed text-fg-dim">
        <span className="text-fg-faint">{item.who}: </span>
        {item.preview}
      </p>
    </Link>
  );
}
