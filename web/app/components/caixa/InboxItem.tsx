import Link from "next/link";
import { Fragment } from "react";
import { type EstadoIa, type LinhaFila, quandoCurto } from "@/lib/caixa";
import { AnelEspera, Avatar, Badge, Contador, Etiqueta, cn, Icone } from "../ui";

/** Estado da IA na linha: o rótulo em texto e os números em mono ("entregando 1/2"). */
export function EstadoDaIa({ ia, className }: { ia: EstadoIa; className?: string }) {
  const partes: Array<[string, boolean]> =
    ia.tipo === "entregando"
      ? [["entregando", false], [`${ia.atual}/${ia.total}`, true]]
      : ia.tipo === "agendado"
        ? [["agendado", false], [ia.hora, true]]
        : [["espera seu OK", false]];
  const titulo =
    ia.tipo === "entregando"
      ? `A IA está entregando a resposta: ${ia.enviados} de ${ia.total} ${ia.total === 1 ? "balão saiu" : "balões saíram"}`
      : ia.tipo === "agendado"
        ? `Resposta da IA agendada: começa a digitar às ${ia.hora}`
        : `A triagem preparou uma pergunta para o cliente; responda "ok ${ia.n}" no seu WhatsApp para enviar`;
  return (
    <span title={titulo} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium leading-none text-id-ia", className)}>
      <Icone nome="spark" tamanho={14} />
      {partes.map(([t, num], i) => (
        <Fragment key={t}>
          {i > 0 && " "}
          <span className={num ? "font-mono tabular-nums" : undefined}>{t}</span>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * Uma linha da fila: avatar, nome com uma etiqueta (ou "menção"), espera ou
 * estado da IA, prévia "Fulano: texto" e não lidas. A conversa aberta ganha a
 * barra de acento; a linha do cursor do teclado ganha o fundo de hover.
 */
export function InboxItem({
  linha,
  href,
  fotoUrl,
  agoraMs,
  atual = false,
  cursor = false,
  onCursor,
}: {
  linha: LinhaFila;
  href: string;
  fotoUrl: string | null;
  agoraMs: number;
  /** Conversa aberta agora. */
  atual?: boolean;
  /** Linha onde está o cursor do J/K. */
  cursor?: boolean;
  onCursor?: () => void;
}) {
  // Pede atenção (espera, IA ou não lidas): nome forte. O resto fica mais leve.
  const lida = linha.naoLidas === 0 && !linha.esperaDesde && !linha.ia;
  return (
    <Link
      href={href}
      data-nav-item
      data-slug={linha.slug}
      aria-current={atual ? "page" : undefined}
      onMouseMove={onCursor}
      className={cn(
        "relative grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[3px] border-b border-line px-5 py-3.5 text-left text-[14px] leading-normal text-fg outline-none transition-colors max-[860px]:px-4",
        "focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)]",
        atual
          ? "bg-selected before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:rounded-r-sm before:bg-accent"
          : cursor
            ? "bg-elevated"
            : "hover:bg-surface-2",
      )}
    >
      <Avatar nome={linha.nome} tipo={linha.tipo} fotoUrl={fotoUrl} tamanho="lg" className="row-span-2" />
      <span className="flex min-w-0 items-center gap-1.5">
        <b className={cn("truncate", lida ? "font-medium text-fg-dim" : "font-semibold text-fg")}>{linha.nome}</b>
        {linha.mencao ? (
          <Badge variant="accent" className="h-5 shrink-0 px-1.5 text-[11.5px]">
            menção
          </Badge>
        ) : (
          linha.etiqueta && <Etiqueta nome={linha.etiqueta} tamanho="sm" className="shrink-0" />
        )}
      </span>
      <span className="flex items-center justify-self-end gap-1.5">
        {linha.ia ? (
          <EstadoDaIa ia={linha.ia} />
        ) : linha.esperaDesde ? (
          <AnelEspera ms={Math.max(0, agoraMs - Date.parse(linha.esperaDesde))} />
        ) : (
          <>
            {linha.silenciada && <Icone nome="mute" tamanho={13} className="text-fg-mute" aria-label="Silenciada" />}
            <span className="font-mono text-[11.5px] tabular-nums text-fg-faint">{quandoCurto(linha.ultimaEm, agoraMs)}</span>
          </>
        )}
      </span>
      <span className="col-start-2 truncate text-[13px] text-fg-dim">
        {linha.previa ? (
          <>
            {linha.previa.de && <span className="text-fg-faint">{linha.previa.de}: </span>}
            {linha.previa.texto}
          </>
        ) : (
          <span className="text-fg-faint">sem mensagens</span>
        )}
      </span>
      <Contador n={linha.naoLidas} destaque={linha.mencao} className="col-start-3 justify-self-end" />
    </Link>
  );
}
