"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { GroupSummary } from "@/lib/data";

/**
 * Indicador "digitando…" no item ATIVO da sidebar. Só o item aberto faz polling
 * (leve, 5s) — evita N requisições. Sem sinal de digitação/gravação, some.
 */
function useActiveTyping(slug: string, active: boolean): "typing" | "recording" | null {
  const [typing, setTyping] = useState<"typing" | "recording" | null>(null);
  useEffect(() => {
    if (!active) {
      setTyping(null);
      return;
    }
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(`/api/presence?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          presence: { status?: string } | null;
        };
        const s = data.presence?.status;
        if (alive) setTyping(s === "typing" || s === "recording" ? s : null);
      } catch {
        /* coletor reiniciando */
      }
    }
    void poll();
    const id = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [slug, active]);
  return typing;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Produz o texto do preview e, quando aplicável, um prefixo mono discreto
 * indicando o tipo de mídia (ex.: "· áudio").
 *
 * Quando lastPreview já carrega "[áudio]" / "[imagem]" etc., extrai o tipo
 * para renderizá-lo separado e manter o truncate no texto restante.
 * Quando não há preview, usa o contador de mensagens sem prefixo de tipo
 * (não há dado de tipo disponível nesse ponto).
 */
function parsePreview(group: GroupSummary): { prefix: string | null; body: string } {
  if (!group.lastPreview) {
    return { prefix: null, body: `${group.messageCount} msg` };
  }
  // Detecta "[tipo]" no final da prévia (ex.: "Fulano: [áudio]")
  const match = group.lastPreview.match(/\[([^\]]+)\]$/);
  if (match) {
    const typeLabel = match[1]; // ex.: "áudio", "imagem", "vídeo"
    // Remove o sufixo "[tipo]" do corpo pra não duplicar
    const body = group.lastPreview.slice(0, -match[0].length).trimEnd();
    return { prefix: `· ${typeLabel}`, body: body || group.lastPreview };
  }
  return { prefix: null, body: group.lastPreview };
}

interface SidebarLinkProps {
  group: GroupSummary;
  /** True quando este item está selecionado pela navegação por teclado. */
  isNav?: boolean;
  /** Chamado quando o mouse move sobre o item — sincroniza o índice de teclado. */
  onNavEnter?: () => void;
}

export function SidebarLink({ group, isNav = false, onNavEnter }: SidebarLinkProps) {
  const pathname = usePathname();
  const active = pathname === `/g/${group.slug}`;
  const { prefix, body } = parsePreview(group);
  const typing = useActiveTyping(group.slug, active);

  // Visual hierarchy:
  //   active  — rota aberta: bg-elevated + ring accent/20
  //   isNav   — seleção por teclado: bg-surface-2 + ring accent/35 (mais visível que hover,
  //             mas sem competir com active quando os dois coincidem)
  //   default — sem fundo; hover via CSS
  const containerClass = [
    "group relative flex items-center gap-3 overflow-hidden rounded-control px-2.5 py-2 transition-colors",
    active
      ? "bg-elevated ring-1 ring-inset ring-accent/20"
      : isNav
        ? "bg-surface-2 ring-1 ring-inset ring-accent/35"
        : "hover:bg-surface-2",
  ].join(" ");

  return (
    <Link
      href={`/g/${group.slug}`}
      data-nav-item
      onMouseMove={onNavEnter}
      className={containerClass}
    >
      {group.avatarPath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/media/${group.avatarPath.split("/").map(encodeURIComponent).join("/")}`}
          alt=""
          className={`h-10 w-10 shrink-0 rounded-[10px] border object-cover transition-colors ${
            active ? "border-accent/40" : isNav ? "border-accent/30" : "border-line"
          }`}
        />
      ) : (
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border text-xs font-semibold transition-colors ${
            active
              ? "border-accent/40 bg-accent/10 text-accent"
              : isNav
                ? "border-accent/25 bg-accent/8 text-accent/80"
                : "border-line bg-surface-2 text-fg-dim group-hover:text-fg"
          }`}
        >
          {group.name.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm font-medium ${active || isNav ? "text-fg" : "text-fg/90"}`}>
          {group.name}
        </div>
        <div
          className={`flex items-baseline gap-1 truncate text-[11px] ${group.unread > 0 ? "text-fg-dim" : "text-fg-faint"}`}
        >
          {typing ? (
            // Digitando/gravando no chat aberto: ember discreto no lugar da prévia.
            <span className="mono truncate text-accent">
              {typing === "recording" ? "gravando áudio…" : "digitando…"}
            </span>
          ) : (
            <>
              {prefix && (
                <span className="mono shrink-0 text-[10px] text-fg-faint">{prefix}</span>
              )}
              <span className="truncate">{body}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          {group.muted && (
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
              className="text-fg-faint"
              aria-label="Silenciado"
            >
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
          <span className="mono text-[10px] text-fg-faint">{formatWhen(group.lastTimestamp)}</span>
        </div>
        {group.unread > 0 && (
          <span
            className={`mono inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
              group.muted
                ? "bg-surface-2 text-fg-faint ring-1 ring-inset ring-line"
                : "bg-accent text-accent-ink"
            }`}
          >
            {group.unread > 99 ? "99+" : group.unread}
          </span>
        )}
      </div>
    </Link>
  );
}
