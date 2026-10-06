"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { GroupSummary } from "@/lib/data";
import { ConnectionDot } from "./ConnectionDot";
import { SairButton } from "./SairButton";
import { SidebarGroups } from "./SidebarGroups";

export function AtendimentoSidebar({ groups, nome }: { groups: GroupSummary[]; nome: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <ConnectionDot />
        <span className="truncate text-sm font-medium text-fg">{nome}</span>
        <SairButton className="mono ml-auto text-xs text-fg-faint transition-colors hover:text-fg" />
      </div>
      <Link
        href="/atendimento"
        className={`mx-2 mt-2 rounded-control px-2.5 py-2 text-sm ${pathname === "/atendimento" ? "bg-elevated text-fg" : "text-fg-dim hover:bg-surface-2"}`}
      >
        Aguardando resposta
      </Link>
      <SidebarGroups groups={groups} />
    </aside>
  );
}
