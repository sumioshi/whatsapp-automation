"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GroupSummary } from "@/lib/data";
import { Kbd } from "./ui/Kbd";

type Cmd = { id: string; label: string; hint?: string; section: string; run: () => void };

/** Command palette estilo Raycast (⌘K) — pular de grupo / rodar ação, teclado-first. */
export function CommandPalette({ groups }: { groups: GroupSummary[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const commands = useMemo<Cmd[]>(() => {
    const go = (path: string) => () => {
      setOpen(false);
      router.push(path);
    };
    return [
      { id: "inbox", label: "Caixa de entrada", section: "Ações", run: go("/inbox") },
      { id: "novo", label: "Nova conversa", section: "Ações", run: go("/novo") },
      { id: "config", label: "Configurações", section: "Ações", run: go("/config") },
      ...groups.map((g) => ({
        id: `g-${g.slug}`,
        label: g.name,
        hint: `${g.messageCount} msg`,
        section: "Ir para grupo",
        run: go(`/g/${g.slug}`),
      })),
    ];
  }, [groups, router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  const sections = useMemo(() => [...new Set(filtered.map((c) => c.section))], [filtered]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    // Affordance visível (botão ⌘K na sidebar) abre via evento — sem prop drilling
    // já que a paleta é montada no layout, separada da Sidebar.
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("cmdk:open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cmdk:open", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-clampa quando a lista muda
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[active]?.run();
    }
  }

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="pop-in frost atmosphere-ember w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
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
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Buscar grupo ou ação…"
            className="w-full bg-transparent py-3.5 text-sm text-fg placeholder:text-fg-faint focus:outline-none"
          />
          <Kbd>esc</Kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="mono px-3 py-8 text-center text-xs text-fg-faint">nada encontrado</p>
          ) : (
            sections.map((section) => (
              <div key={section}>
                <div className="mono px-2.5 pt-2 pb-1 text-[10px] uppercase tracking-wider text-fg-faint">
                  {section}
                </div>
                {filtered
                  .filter((c) => c.section === section)
                  .map((c) => {
                    const idx = filtered.indexOf(c);
                    const isActive = idx === active;
                    return (
                      <button
                        key={c.id}
                        ref={isActive ? activeRef : null}
                        type="button"
                        onMouseMove={() => setActive(idx)}
                        onClick={() => c.run()}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                          isActive ? "bg-accent/12" : "hover:bg-surface-2"
                        }`}
                      >
                        <span className={`truncate ${isActive ? "text-accent" : "text-fg/85"}`}>
                          {c.label}
                        </span>
                        {c.hint && (
                          <span className="mono ml-auto shrink-0 text-[10px] text-fg-faint">
                            {c.hint}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] text-fg-faint">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span>navegar</span>
            <Kbd>↵</Kbd>
            <span>abrir</span>
          </div>
          <span className="mono text-[10px] text-fg-faint">signal·room</span>
        </div>
      </div>
    </div>
  );
}
