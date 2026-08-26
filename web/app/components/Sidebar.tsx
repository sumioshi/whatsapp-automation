"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { GroupSummary } from "@/lib/data";
import { CmdkButton } from "./CmdkButton";
import { ConnectionDot } from "./ConnectionDot";
import { SidebarGroups } from "./SidebarGroups";
import { InstallButton } from "./InstallButton";
import { ThemeToggle } from "./ThemeToggle";

const CHAVE_RECOLHIDA = "wac-sidebar-recolhida";

/** Itens de navegação — linha chapada (ícone + rótulo), sem caixinha em volta. */
const NAV: Array<{ href: string; rotulo: string; icone: React.ReactNode }> = [
  {
    href: "/clientes",
    rotulo: "Clientes",
    icone: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/inbox",
    rotulo: "Caixa de entrada",
    icone: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    ),
  },
  {
    href: "/novo?modo=contato",
    rotulo: "Contatos",
    icone: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/agenda",
    rotulo: "Agenda",
    icone: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: "/links",
    rotulo: "Links de projeto",
    icone: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
];

function IconeRecolher({ recolhida }: { recolhida: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      {recolhida ? <path d="m14 9 3 3-3 3" /> : <path d="m17 9-3 3 3 3" />}
    </svg>
  );
}

export function Sidebar({ groups }: { groups: GroupSummary[] }) {
  const pathname = usePathname();
  const [recolhida, setRecolhida] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(CHAVE_RECOLHIDA) === "1") setRecolhida(true);
  }, []);

  function alternar() {
    setRecolhida((v) => {
      window.localStorage.setItem(CHAVE_RECOLHIDA, v ? "0" : "1");
      return !v;
    });
  }

  // ── Trilho recolhido: só logo, navegação por ícone e o botão de expandir ──
  if (recolhida) {
    return (
      <aside className="flex w-13 shrink-0 flex-col items-center border-r border-line bg-surface py-3">
        <Link href="/clientes" title="Signal Room" className="mb-3">
          <ConnectionDot />
        </Link>
        <nav className="flex flex-col items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={item.rotulo}
              className={`grid h-8 w-8 place-items-center rounded-[6px] transition-colors ${
                pathname === item.href.split("?")[0]
                  ? "bg-surface-2 text-fg"
                  : "text-fg-faint hover:bg-surface-2 hover:text-fg"
              }`}
            >
              {item.icone}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-1">
          <ThemeToggle compacto />
          <Link
            href="/config"
            title="Configurações"
            className="grid h-8 w-8 place-items-center rounded-[6px] text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          <button
            type="button"
            onClick={alternar}
            title="Expandir barra lateral"
            className="grid h-8 w-8 place-items-center rounded-[6px] text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <IconeRecolher recolhida />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-surface">
      <header className="flex items-center justify-between px-4 py-3.5">
        <Link href="/clientes" className="group flex items-center gap-2">
          <ConnectionDot />
          <span className="mono text-[13px] font-semibold tracking-tight text-fg">
            SIGNAL<span className="text-accent">·</span>ROOM
          </span>
        </Link>
        <div className="flex items-center gap-0.5">
          <InstallButton />
          <CmdkButton />
          <Link
            href="/config"
            title="Configurações"
            className="grid h-7 w-7 place-items-center rounded-[6px] text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          <ThemeToggle />
          <button
            type="button"
            onClick={alternar}
            title="Recolher barra lateral"
            className="grid h-7 w-7 place-items-center rounded-[6px] text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <IconeRecolher recolhida={false} />
          </button>
        </div>
      </header>

      <nav className="px-2 pb-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-sm transition-colors ${
              pathname === item.href.split("?")[0]
                ? "bg-surface-2 text-fg"
                : "text-fg-dim hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <span className="text-fg-faint">{item.icone}</span>
            {item.rotulo}
          </Link>
        ))}
      </nav>

      <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <span className="mono text-[11px] uppercase tracking-wider text-fg-faint">
          {groups.length} {groups.length === 1 ? "conversa" : "conversas"}
        </span>
        <Link
          href="/novo"
          className="pressable flex items-center gap-1.5 rounded-[6px] border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
        >
          <span className="text-sm leading-none">+</span> Nova conversa
        </Link>
      </div>

      <SidebarGroups groups={groups} />
    </aside>
  );
}
