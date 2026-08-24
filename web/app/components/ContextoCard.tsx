"use client";

import { useState } from "react";
import { ChipEtiqueta, EditorEtiquetas } from "./Etiqueta";

/** Dados de contexto do chat, montados server-side na página. */
export interface ChatContexto {
  slug: string;
  nome: string;
  tipo: "grupo" | "dm";
  avatarPath: string | null;
  etiquetas: string[];
  conhecidas: string[];
  autonomo: boolean;
  silenciado: boolean;
  mensagens: number;
  /** Rótulo de última atividade já resolvido no servidor ("há 3h" / "05/08/26"). */
  atividadeLabel: string | null;
}

/**
 * Cartão de contexto no topo do painel lateral do chat: quem é, de qual
 * contrato é (etiquetas editáveis) e o estado operacional — o "prontuário"
 * que evita voltar pra lista só pra lembrar com quem se está falando.
 */
export function ContextoCard({ contexto }: { contexto: ChatContexto }) {
  const [etiquetas, setEtiquetas] = useState<string[]>(contexto.etiquetas);
  const [editando, setEditando] = useState(false);

  return (
    <div className="border-b border-line px-3 py-3">
      <div className="flex items-center gap-2.5">
        {contexto.avatarPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/media/${contexto.avatarPath.split("/").map(encodeURIComponent).join("/")}`}
            alt=""
            className="h-10 w-10 shrink-0 rounded-[10px] border border-line object-cover"
          />
        ) : (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-line bg-surface-2 text-xs font-semibold text-fg-dim">
            {contexto.nome.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-fg">{contexto.nome}</div>
          <div className="mono text-[10px] text-fg-faint">
            {contexto.tipo === "dm" ? "contato" : "grupo"} · {contexto.mensagens} msgs
            {contexto.atividadeLabel && ` · ${contexto.atividadeLabel}`}
          </div>
        </div>
      </div>

      <div className="relative mt-2.5 flex flex-wrap items-center gap-1">
        {etiquetas.map((e) => (
          <ChipEtiqueta key={e} nome={e} />
        ))}
        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          className="rounded-full border border-dashed border-line px-1.5 text-[10px] text-fg-faint transition-colors hover:border-line-2 hover:text-fg"
        >
          {etiquetas.length === 0 ? "+ etiqueta" : "+"}
        </button>
        {editando && (
          <EditorEtiquetas
            slug={contexto.slug}
            atuais={etiquetas}
            conhecidas={contexto.conhecidas}
            onSalvo={setEtiquetas}
            onFechar={() => setEditando(false)}
          />
        )}
      </div>

      <div className="mono mt-2.5 flex flex-wrap gap-2 text-[10px]">
        <span
          className={`rounded-full border px-2 py-px ${
            contexto.autonomo
              ? "border-accent/40 text-accent"
              : "border-line text-fg-dim"
          }`}
          title={
            contexto.autonomo
              ? "A IA envia direto neste chat"
              : "A IA mostra o texto e espera OK antes de enviar"
          }
        >
          {contexto.autonomo ? "envio autônomo" : "envio com confirmação"}
        </span>
        {contexto.silenciado && (
          <span className="rounded-full border border-line px-2 py-px text-fg-faint">
            silenciado
          </span>
        )}
      </div>
    </div>
  );
}
