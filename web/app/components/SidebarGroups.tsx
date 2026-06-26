"use client";

import { useMemo, useRef, useState } from "react";
import type { GroupSummary } from "@/lib/data";
import { SidebarLink } from "./SidebarLink";
import { useListNav } from "./useListNav";

export function SidebarGroups({ groups }: { groups: GroupSummary[] }) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Separa em três buckets mantendo a ordem já estabelecida por listGroups:
  // fixados → ativos → arquivados.
  const { pinned, active, archived, filtered } = useMemo(() => {
    const q = query.trim().toLowerCase();

    // Com busca ativa: filtra todos (incluindo arquivados) de uma vez.
    if (q) {
      const all = groups.filter((g) => g.name.toLowerCase().includes(q));
      return { pinned: [], active: [], archived: [], filtered: all };
    }

    const pinned: GroupSummary[] = [];
    const active: GroupSummary[] = [];
    const archived: GroupSummary[] = [];
    for (const g of groups) {
      if (g.archived) archived.push(g);
      else if (g.pinned) pinned.push(g);
      else active.push(g);
    }
    return { pinned, active, archived, filtered: [] };
  }, [groups, query]);

  // A lista que o useListNav enxerga depende do estado de busca e de arquivados.
  const navList = useMemo(() => {
    if (query.trim()) return filtered;
    const visible = [...pinned, ...active];
    if (showArchived) return [...visible, ...archived];
    return visible;
  }, [query, filtered, pinned, active, archived, showArchived]);

  const { navIndex, setNavIndex } = useListNav(navList, navRef);

  if (groups.length === 0) {
    return (
      <p className="px-2 py-6 text-sm leading-relaxed text-fg-dim">
        Nenhum grupo ainda. Rode o coletor, pareie o WhatsApp e marque grupos com{" "}
        <code className="mono text-accent">watch: true</code>.
      </p>
    );
  }

  // Renderiza um item com o índice correto dentro de navList.
  function renderItem(g: GroupSummary, navListIndex: number) {
    return (
      <SidebarLink
        key={g.slug}
        group={g}
        isNav={navIndex === navListIndex}
        onNavEnter={() => setNavIndex(navListIndex)}
      />
    );
  }

  const searchMode = query.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-2 pb-2">
        <div className="flex items-center gap-2 rounded-control border border-line bg-surface-2 px-2.5 py-1.5 focus-within:border-accent/40">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-fg-faint"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar grupo…"
            className="w-full bg-transparent text-sm text-fg placeholder:text-fg-faint focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mono shrink-0 text-xs text-fg-faint hover:text-fg"
              aria-label="Limpar busca"
            >
              esc
            </button>
          )}
        </div>
      </div>

      <nav
        ref={navRef}
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3"
        aria-label="Conversas"
      >
        {searchMode ? (
          // Modo busca: mostra tudo numa lista plana (incluindo arquivados).
          filtered.length === 0 ? (
            <p className="mono px-2 py-6 text-center text-xs text-fg-faint">
              nada encontrado p/ &quot;{query}&quot;
            </p>
          ) : (
            filtered.map((g, i) => renderItem(g, i))
          )
        ) : (
          <>
            {/* Fixados */}
            {pinned.length > 0 && (
              <>
                <div className="mono flex items-center gap-1.5 px-2 pb-0.5 pt-1 text-[10px] uppercase tracking-wider text-fg-faint">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="9"
                    height="9"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="none"
                    aria-hidden
                  >
                    <path d="M16 12V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v8l-2 2v2h5v5l1 1 1-1v-5h5v-2l-2-2z" />
                  </svg>
                  fixados
                </div>
                {pinned.map((g, i) => renderItem(g, i))}
              </>
            )}

            {/* Ativos */}
            {pinned.length > 0 && active.length > 0 && (
              <div className="mono px-2 pb-0.5 pt-2 text-[10px] uppercase tracking-wider text-fg-faint">
                conversas
              </div>
            )}
            {active.map((g, i) => renderItem(g, pinned.length + i))}

            {/* Arquivados */}
            {archived.length > 0 && (
              <div className="mt-1 border-t border-line pt-1">
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  className="mono flex w-full items-center gap-1.5 rounded-control px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg-dim"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points={showArchived ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
                  </svg>
                  arquivados ({archived.length})
                </button>
                {showArchived &&
                  archived.map((g, i) =>
                    renderItem(g, pinned.length + active.length + i),
                  )}
              </div>
            )}
          </>
        )}
      </nav>

      {/* Hint de atalhos — discreto, mono, coerente com o estilo terminal */}
      <div className="mono flex items-center gap-3 border-t border-line px-3 py-2 text-[10px] text-fg-faint">
        <span className="flex items-center gap-1">
          <kbd className="kbd inline-flex items-center rounded px-1 py-0.5 text-[9px] bg-surface-2 border border-line-2 text-fg-faint">j</kbd>
          <kbd className="kbd inline-flex items-center rounded px-1 py-0.5 text-[9px] bg-surface-2 border border-line-2 text-fg-faint">k</kbd>
          <span>navegar</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="kbd inline-flex items-center rounded px-1 py-0.5 text-[9px] bg-surface-2 border border-line-2 text-fg-faint">↵</kbd>
          <span>abrir</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="kbd inline-flex items-center rounded px-1 py-0.5 text-[9px] bg-surface-2 border border-line-2 text-fg-faint">u</kbd>
          <span>não lida</span>
        </span>
      </div>
    </div>
  );
}
