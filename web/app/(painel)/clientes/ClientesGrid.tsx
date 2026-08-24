"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/app/components/ui";
import { ChipEtiqueta, EditorEtiquetas } from "@/app/components/Etiqueta";
import type { ClienteCard } from "@/lib/clientes";
import { BAND_LABEL_CLASS } from "@/lib/sla";

/** Grade CRM dos chats — filtros/busca vivem na toolbar do ClientesView. */
export function ClientesGrid({ cards, conhecidas = [] }: { cards: ClienteCard[]; conhecidas?: string[] }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 md:px-8">
      <div className="mx-auto max-w-6xl">
        {cards.length === 0 ? (
          <EmptyState
            title="Nada por aqui"
            description="Nenhuma conversa bate com o filtro atual."
            className="mt-12"
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((c) => (
              <CardCliente key={c.slug} c={c} conhecidas={conhecidas} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Iniciais pro avatar de fallback (até 2 letras). */
function iniciais(nome: string): string {
  const partes = nome
    .split(/\s+/)
    .filter((p) => /^[\p{L}\p{N}]/u.test(p))
    .slice(0, 2);
  return partes.map((p) => [...p][0]?.toUpperCase() ?? "").join("") || "?";
}

export function CardCliente({ c, conhecidas = [] }: { c: ClienteCard; conhecidas?: string[] }) {
  const [etiquetas, setEtiquetas] = useState<string[]>(c.etiquetas);
  const [editando, setEditando] = useState(false);
  // Badge só quando há algo a dizer — "em dia" é a ausência de badge.
  const badge = c.aguardando ? (
    <span
      className={`mono shrink-0 text-[11px] font-medium ${c.band ? BAND_LABEL_CLASS[c.band] : "text-fg-dim"}`}
      title={`Cliente aguardando resposta ${c.waitingLabel ?? ""}`}
    >
      ● {c.waitingLabel ?? "aguardando"}
    </span>
  ) : null;

  return (
    <Link
      href={`/g/${c.slug}`}
      className={`group flex flex-col gap-2 rounded-card border border-line bg-surface p-4 transition-colors hover:border-line-2 ${
        c.silenciado ? "opacity-55" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        {c.avatarPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/media/${c.avatarPath.split("/").map(encodeURIComponent).join("/")}`}
            alt=""
            className="h-11 w-11 shrink-0 rounded-[12px] border border-line object-cover"
          />
        ) : (
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-line bg-surface-2 text-sm font-semibold text-fg-dim">
            {iniciais(c.nome)}
          </div>
        )}
        <span className="min-w-0 flex-1 truncate text-base font-semibold text-fg" title={c.nome}>
          {c.nome}
        </span>
        {c.naoLidas > 0 && (
          <span
            className="mono shrink-0 rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold text-accent-ink"
            title={`${c.naoLidas} mensagens novas desde a última visita`}
          >
            {c.naoLidas > 99 ? "99+" : c.naoLidas}
          </span>
        )}
        {badge}
      </div>

      <div className="relative flex flex-wrap items-center gap-1">
        {etiquetas.map((e) => (
          <ChipEtiqueta key={e} nome={e} />
        ))}
        <button
          type="button"
          title="Etiquetas"
          onClick={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            setEditando((v) => !v);
          }}
          className="rounded-full border border-dashed border-line px-1.5 text-[10px] text-fg-faint opacity-0 transition-all group-hover:opacity-100 hover:border-line-2 hover:text-fg"
        >
          {etiquetas.length === 0 ? "+ etiqueta" : "+"}
        </button>
        {editando && (
          <EditorEtiquetas
            slug={c.slug}
            atuais={etiquetas}
            conhecidas={conhecidas}
            onSalvo={setEtiquetas}
            onFechar={() => setEditando(false)}
          />
        )}
      </div>

      {c.ultimaPreview && (
        <p className="truncate text-[13px] text-fg-dim" title={c.ultimaPreview}>
          {c.ultimaPreview}
        </p>
      )}

      {c.nota && (
        <p className="truncate text-xs text-fg-faint" title={c.nota}>
          📝 {c.nota}
        </p>
      )}

      {c.desatualizado && (
        <p className="mono text-[10px] text-[--color-accent-2]" title="O WhatsApp registra atividade mais nova que a última mensagem capturada — a sincronização automática vai tentar preencher.">
          ⟳ pode estar desatualizado
        </p>
      )}
      <div className="mono mt-auto flex items-center gap-2 pt-1 text-[10px] text-fg-faint">
        <span>{c.mensagens} msgs</span>
        {c.atividadeLabel && (
          <>
            <span>·</span>
            <span>{c.atividadeLabel}</span>
          </>
        )}
        {c.silenciado && (
          <>
            <span>·</span>
            <span>silenciado</span>
          </>
        )}
      </div>
    </Link>
  );
}
