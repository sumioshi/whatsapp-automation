import { buildInbox } from "@/lib/inbox";
import { countByBand } from "@/lib/sla";
import { EmptyState } from "@/app/components/ui";
import { InboxItem } from "./InboxItem";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const items = await buildInbox();
  const n = items.length;
  const counts = countByBand(items);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line bg-surface px-5 py-3">
        <h1 className="font-medium text-fg">Caixa de entrada</h1>

        {n === 0 ? (
          <span className="mono text-[11px] text-fg-faint">tudo em dia</span>
        ) : (
          <>
            <span className="mono text-[11px] text-fg-faint">
              {n} {n === 1 ? "pede" : "pedem"} atenção · mais antigo primeiro
            </span>

            {/* Contagem por faixa — visível só quando há itens */}
            <span className="ml-auto flex items-center gap-2" aria-label="Contagem por urgência">
              {counts.hot > 0 && (
                <span className="mono text-[10px] text-danger" title="Aguardando há mais de 24h">
                  {counts.hot} &gt;24h
                </span>
              )}
              {counts.warm > 0 && (
                <span className="mono text-[10px] text-[--color-accent-2]" title="Aguardando entre 4h e 24h">
                  {counts.warm} 4–24h
                </span>
              )}
              {counts.mild > 0 && (
                <span className="mono text-[10px] text-fg-dim" title="Aguardando entre 1h e 4h">
                  {counts.mild} 1–4h
                </span>
              )}
              {counts.fresh > 0 && (
                <span className="mono text-[10px] text-fg-faint" title="Aguardando há menos de 1h">
                  {counts.fresh} &lt;1h
                </span>
              )}
            </span>
          </>
        )}
      </header>

      <div className="signal-grid flex-1 overflow-y-auto px-4 py-6 md:px-10">
        {n === 0 ? (
          <EmptyState
            icon={
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="text-fg-faint"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            }
            title="Fila limpa"
            description="Nenhum cliente aguardando e nenhuma menção sem resposta nos grupos monitorados."
            className="mt-12"
          />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-2.5">
            {items.map((item) => (
              <InboxItem key={`${item.slug}-${item.timestamp}`} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
