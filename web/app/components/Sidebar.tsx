import Link from "next/link";
import type { GroupSummary } from "@/lib/data";
import { CmdkButton } from "./CmdkButton";
import { ConnectionDot } from "./ConnectionDot";
import { SidebarGroups } from "./SidebarGroups";

export function Sidebar({ groups }: { groups: GroupSummary[] }) {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-surface">
      <header className="flex items-center justify-between border-b border-line px-4 py-3.5">
        <Link href="/" className="group flex items-center gap-2">
          <ConnectionDot />
          <span className="mono text-[13px] font-semibold tracking-tight text-fg">
            SIGNAL<span className="text-accent">·</span>ROOM
          </span>
        </Link>
        <div className="flex items-center gap-1.5">
          <CmdkButton />
          <Link
            href="/config"
            title="Configurações"
            className="grid h-8 w-8 place-items-center rounded-control text-fg-dim transition-colors hover:bg-elevated hover:text-fg"
          >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-label="Configurações"
            role="img"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          </Link>
        </div>
      </header>

      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="mono text-[11px] uppercase tracking-wider text-fg-faint">
          {groups.length} {groups.length === 1 ? "grupo" : "grupos"}
        </span>
        <Link
          href="/novo"
          className="flex items-center gap-1.5 rounded-control border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
        >
          <span className="text-sm leading-none">+</span> Nova conversa
        </Link>
      </div>

      <Link
        href="/inbox"
        className="mx-2 mb-1 flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <span className="grid h-7 w-7 place-items-center rounded-control border border-line bg-surface-2 text-fg-dim">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
        </span>
        <span className="font-medium">Caixa de entrada</span>
      </Link>

      <Link
        href="/novo?modo=contato"
        className="mx-2 mb-1 flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <span className="grid h-7 w-7 place-items-center rounded-control border border-line bg-surface-2 text-fg-dim">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </span>
        <span className="font-medium">Contatos</span>
      </Link>

      <Link
        href="/links"
        className="mx-2 mb-1 flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <span className="grid h-7 w-7 place-items-center rounded-control border border-line bg-surface-2 text-fg-dim">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </span>
        <span className="font-medium">Links de projeto</span>
      </Link>

      <SidebarGroups groups={groups} />
    </aside>
  );
}
