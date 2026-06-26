"use client";

import { useCallback, useRef, useState } from "react";
import type { MessageView } from "@/lib/data";
import { cn } from "./ui";
import { CopilotPanel } from "./CopilotPanel";
import { NotesPanel } from "./NotesPanel";
import { Timeline } from "./Timeline";

type Panel = "notas" | "copiloto";

/** Conversa + painel lateral togglável (Notas / Copiloto) à direita. */
export function GroupWorkspace({
  slug,
  groupName,
  messages,
}: {
  slug: string;
  groupName: string;
  messages: MessageView[];
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
  // Rascunho do copiloto → composer. O nonce reaplica o mesmo texto a cada "→ composer".
  const [draft, setDraft] = useState<{ text: string; nonce: number } | null>(null);
  const pushDraft = useCallback((text: string) => {
    setDraft((d) => ({ text, nonce: (d?.nonce ?? 0) + 1 }));
  }, []);

  // Lembra qual painel abrir ao clicar no trigger (default: copiloto).
  const lastPanelRef = useRef<Panel>("copiloto");

  const openPanel = useCallback((p: Panel) => {
    lastPanelRef.current = p;
    setPanel(p);
  }, []);

  const closePanel = useCallback(() => setPanel(null), []);

  const switchPanel = useCallback((p: Panel) => {
    lastPanelRef.current = p;
    setPanel(p);
  }, []);

  const handleTrigger = useCallback(() => {
    setPanel(lastPanelRef.current);
  }, []);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      {/* ── Área principal (timeline + trigger de painel) ─────────────── */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <Timeline
          slug={slug}
          groupName={groupName}
          messages={messages}
          draft={draft}
          onUseDraft={pushDraft}
        />

        {/* Trigger compacto: só aparece quando o painel está fechado. Em telas
            menores que lg o painel não existe, então não mostramos o trigger. */}
        {panel === null && (
          <button
            type="button"
            title="Abrir painel lateral"
            onClick={handleTrigger}
            className={cn(
              "pressable absolute top-2.5 right-4 z-10",
              "hidden lg:flex items-center justify-center",
              "h-7 w-7 rounded-control border border-line bg-surface-2 text-fg-faint",
              "hover:border-line-2 hover:text-fg transition-colors",
            )}
            aria-label="Abrir painel lateral"
          >
            {/* Ícone de painel lateral (layout-panel-right) */}
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
              aria-hidden
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M15 3v18" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Painel lateral ────────────────────────────────────────────── */}
      {panel && (
        <aside
          className={cn(
            "hidden lg:flex flex-col",
            "w-80 shrink-0 border-l border-line bg-surface",
            "pop-in", // entrada sutil
          )}
        >
          {/* Tab bar do painel — vive dentro do aside, sem colisão */}
          <PanelTabBar
            active={panel}
            onSwitch={switchPanel}
            onClose={closePanel}
          />

          {/* Conteúdo do painel */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {panel === "notas" ? (
              <NotesPanel slug={slug} />
            ) : (
              <CopilotPanel slug={slug} onDraft={pushDraft} />
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

/* ── Tab bar do painel lateral ──────────────────────────────────────── */

function PanelTabBar({
  active,
  onSwitch,
  onClose,
}: {
  active: Panel;
  onSwitch: (p: Panel) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
      <PanelTab
        active={active === "notas"}
        onClick={() => onSwitch("notas")}
        label="Notas"
        icon={
          <>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M8 13h8M8 17h5" />
          </>
        }
      />
      <PanelTab
        active={active === "copiloto"}
        onClick={() => onSwitch("copiloto")}
        label="Copiloto"
        icon={
          <>
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
          </>
        }
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Fechar painel */}
      <button
        type="button"
        onClick={onClose}
        title="Fechar painel"
        aria-label="Fechar painel"
        className={cn(
          "pressable flex items-center justify-center",
          "h-6 w-6 rounded-[6px] border border-transparent text-fg-faint",
          "hover:border-line hover:text-fg transition-colors",
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/** Aba do painel lateral (Notas / Copiloto). */
function PanelTab({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs font-medium",
        "transition-colors",
        active
          ? "bg-accent/12 text-accent"
          : "text-fg-faint hover:bg-surface-2 hover:text-fg",
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {icon}
      </svg>
      {label}
    </button>
  );
}
