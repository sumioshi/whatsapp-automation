"use client";

import Link from "next/link";
import { useState } from "react";
import { EditorEtiquetas } from "@/app/components/Etiqueta";
import { useRotas } from "@/app/components/RotasPainel";
import { AnelEspera, Avatar, Contador, Etiqueta, cn } from "@/app/components/ui";
import type { ClienteCard } from "@/lib/clientes";
import { IcMais, IcNota, IcSilencio, IcSincronizar } from "./icones";

/**
 * Cartão do cliente no Quadro: conversa, etiquetas (com o editor), nota e quanto espera.
 * O nome é o link e cobre o cartão inteiro; o editor de etiquetas fica por cima dele.
 */
export function CartaoCliente({ c, conhecidas = [] }: { c: ClienteCard; conhecidas?: string[] }) {
  const rotas = useRotas();
  const [etiquetas, setEtiquetas] = useState<string[]>(c.etiquetas);
  const [editando, setEditando] = useState(false);

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-2 rounded-card border border-line bg-surface p-3.5 [box-shadow:var(--shadow-card)] transition-colors hover:border-line-2 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-1 has-[a:focus-visible]:outline-accent",
        c.silenciado && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2.5">
        <Avatar nome={c.nome} tipo={c.tipo} fotoUrl={c.avatarPath ? rotas.midia(c.avatarPath) : null} tamanho="md" />
        <Link
          href={rotas.chat(c.slug)}
          title={c.nome}
          className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg outline-none after:absolute after:inset-0 after:rounded-card after:content-['']"
        >
          {c.nome}
        </Link>
        <Contador n={c.naoLidas} destaque={!c.silenciado} />
        {c.aguardando && <AnelEspera ms={c.waitingMs} />}
      </div>

      <div className="relative z-10 flex flex-wrap items-center gap-1 self-start">
        {etiquetas.map((e) => (
          <Etiqueta key={e} nome={e} tamanho="sm" />
        ))}
        <button
          type="button"
          aria-label={etiquetas.length ? "Editar etiquetas" : "Pôr etiqueta"}
          aria-expanded={editando}
          onClick={() => setEditando((v) => !v)}
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded-full border border-dashed border-line-2 px-1.5 text-[11.5px] text-fg-faint transition-opacity hover:border-fg-mute hover:text-fg focus-visible:opacity-100 group-hover:opacity-100",
            editando ? "opacity-100" : "opacity-0",
          )}
        >
          <IcMais className="h-3 w-3" />
          {etiquetas.length === 0 && "etiqueta"}
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
        <p className="flex items-center gap-1.5 text-[12.5px] text-fg-faint" title={c.nota}>
          <IcNota className="h-3.5 w-3.5" />
          <span className="truncate">{c.nota}</span>
        </p>
      )}

      {c.desatualizado && (
        <p
          className="flex items-center gap-1.5 text-[12px] text-warn"
          title="O WhatsApp tem atividade mais nova que a última mensagem guardada; a sincronização vai buscar."
        >
          <IcSincronizar className="h-3.5 w-3.5" />
          Pode estar desatualizado
        </p>
      )}

      <div className="mt-auto flex items-center gap-1.5 pt-0.5 text-[12px] text-fg-faint">
        <span>
          <span className="font-mono tabular-nums">{c.mensagens}</span> mensagens
        </span>
        {c.atividadeLabel && (
          <>
            <span aria-hidden>·</span>
            <span>{c.atividadeLabel}</span>
          </>
        )}
        {c.silenciado && (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <IcSilencio className="h-3 w-3" />
              silenciado
            </span>
          </>
        )}
      </div>
    </div>
  );
}
