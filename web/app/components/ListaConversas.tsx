"use client";

import Link from "next/link";
import type { GroupSummary } from "@/lib/data";
import { SidebarGroups } from "./SidebarGroups";

/** Coluna de conversas ao lado do trilho. Fica aqui até a Caixa em três colunas (etapa 2). */
export function ListaConversas({ groups }: { groups: GroupSummary[] }) {
  return (
    <aside aria-label="Conversas" className="flex w-[300px] shrink-0 flex-col border-r border-line bg-surface max-[860px]:hidden">
      <header className="flex items-center gap-2 px-4 pb-3 pt-4">
        <h2 className="font-title text-[20px] font-medium tracking-[-0.01em] text-fg">Conversas</h2>
        <span className="font-mono text-[12px] text-fg-faint">{groups.length}</span>
        <Link
          href="/novo"
          className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-control border border-line-2 bg-surface px-2.5 text-[12.5px] font-medium text-fg transition-colors hover:bg-elevated"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nova
        </Link>
      </header>
      <SidebarGroups groups={groups} />
    </aside>
  );
}
