"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { type MidiaResumo, type PainelCliente as Dados, type Tom, quandoCurto } from "@/lib/caixa";
import { instanteLongo } from "@/lib/formatar-data";
import { ContextoCard } from "../ContextoCard";
import { ContratoForm } from "../ContratoForm";
import { CopilotPanel } from "../CopilotPanel";
import { EstadoNotas, NotesPanel, useNotas } from "../NotesPanel";
import { useRotas } from "../RotasPainel";
import { Avatar, Button, IconButton, MedidorUso, Pares, cn } from "../ui";
import { Icone } from "./icones";

type IdSecao = "contrato" | "pessoas" | "notas" | "copiloto" | "midia";

const CHAVE_SECOES = "wac-painel-secoes";
const ABERTAS_PADRAO: Record<IdSecao, boolean> = { contrato: true, pessoas: true, notas: true, copiloto: true, midia: false };
const PESSOAS_VISIVEIS = 6;

const PONTO: Record<Tom, string> = { ok: "bg-ok", neutro: "bg-fg-mute", warn: "bg-warn-mark", danger: "bg-danger" };

function Secao({
  id,
  titulo,
  fim,
  aberta,
  onAlternar,
  children,
}: {
  id: IdSecao;
  titulo: string;
  fim?: ReactNode;
  aberta: boolean;
  onAlternar: (id: IdSecao) => void;
  children: ReactNode;
}) {
  return (
    <section data-secao={id} className="border-b border-line">
      <button
        type="button"
        aria-expanded={aberta}
        onClick={() => onAlternar(id)}
        className="flex h-11 w-full items-center gap-1.5 px-5 text-left text-[12.5px] font-semibold text-fg-dim transition-colors hover:text-fg"
      >
        <Icone nome="baixo" tamanho={14} className={cn("text-fg-faint transition-transform motion-reduce:transition-none", !aberta && "-rotate-90")} />
        {titulo}
        {fim !== undefined && <span className="ml-auto font-normal text-fg-faint">{fim}</span>}
      </button>
      {aberta && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}

const ROTULO_MIDIA: Record<string, string> = {
  audio: "áudio",
  video: "vídeo",
  gif: "gif",
  sticker: "figurinha",
  image: "imagem",
};

function Miniatura({ m }: { m: MidiaResumo }) {
  const rotas = useRotas();
  const [falhou, setFalhou] = useState(false);
  const src = rotas.midia(m.mediaPath);
  const ext = m.mediaPath.split(".").pop()?.toLowerCase();
  const rotulo = m.tipo === "document" ? (ext && ext.length <= 4 ? ext : "doc") : (ROTULO_MIDIA[m.tipo] ?? m.tipo);
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      title={`${rotulo}, ${instanteLongo(m.timestamp)}`}
      className="relative grid aspect-square place-items-end justify-start overflow-hidden rounded-[6px] border border-line bg-elevated p-[5px] font-mono text-[10px] leading-none text-fg-faint transition-colors hover:border-line-2"
    >
      {m.tipo === "image" && !falhou && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setFalhou(true)} className="absolute inset-0 h-full w-full object-cover" />
      )}
      <span className={cn("relative", m.tipo === "image" && !falhou && "sr-only")}>{rotulo}</span>
    </a>
  );
}

/**
 * Painel do cliente, à direita da conversa: quem é, contrato, pessoas, notas,
 * copiloto e mídia, em seções que recolhem. Abre e fecha com "]" e com o botão
 * do cabeçalho; abaixo de 1360 px abre por cima da conversa. Na área da equipe
 * aparecem só as pessoas e a mídia.
 */
export function PainelCliente({
  dados,
  aberto,
  sobreposto,
  agora,
  onFechar,
  onDraft,
  onSalvo,
  pedidoCopiloto = 0,
}: {
  dados: Dados;
  /** Aberto ao lado da conversa (telas largas). */
  aberto: boolean;
  /** Aberto por cima da conversa (telas estreitas). */
  sobreposto: boolean;
  agora: number;
  onFechar: () => void;
  onDraft?: (texto: string) => void;
  /** Algo mudou no servidor (etiqueta, contrato): atualiza a fila e o painel. */
  onSalvo?: () => void;
  /** Muda quando o compositor pede o copiloto: abre e mostra a seção. */
  pedidoCopiloto?: number;
}) {
  const dono = dados.dono;
  const ref = useRef<HTMLElement>(null);
  const [abertas, setAbertas] = useState(ABERTAS_PADRAO);
  const [editandoContrato, setEditandoContrato] = useState(false);
  const notas = useNotas(dados.slug, dono !== null);

  useEffect(() => {
    try {
      const salvas = JSON.parse(window.localStorage.getItem(CHAVE_SECOES) ?? "null") as Partial<Record<IdSecao, boolean>> | null;
      if (salvas) setAbertas((a) => ({ ...a, ...salvas }));
    } catch {
      /* sem armazenamento: seções no padrão */
    }
  }, []);

  const alternar = useCallback((id: IdSecao) => {
    setAbertas((a) => {
      const prox = { ...a, [id]: !a[id] };
      try {
        window.localStorage.setItem(CHAVE_SECOES, JSON.stringify(prox));
      } catch {
        /* vale só nesta aba */
      }
      return prox;
    });
  }, []);

  // O botão da IA pediu o copiloto: abre a seção e leva até ela.
  useEffect(() => {
    if (!pedidoCopiloto) return;
    setAbertas((a) => ({ ...a, copiloto: true }));
    requestAnimationFrame(() => ref.current?.querySelector('[data-secao="copiloto"]')?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }, [pedidoCopiloto]);

  // Por cima da conversa: Esc e clique fora fecham.
  useEffect(() => {
    if (!sobreposto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    const fora = (e: PointerEvent) => {
      const alvo = e.target as HTMLElement;
      if (ref.current?.contains(alvo) || alvo.closest("[data-alterna-painel]")) return;
      onFechar();
    };
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fora);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fora);
    };
  }, [sobreposto, onFechar]);

  const pessoas = dados.pessoas.slice(0, PESSOAS_VISIVEIS);
  const outras = dados.pessoas.length - pessoas.length;

  return (
    <aside
      ref={ref}
      aria-label="Painel do cliente"
      className={cn(
        "w-[328px] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface-2",
        aberto ? "min-[1361px]:flex" : "min-[1361px]:hidden",
        sobreposto
          ? "max-[1360px]:fixed max-[1360px]:inset-y-0 max-[1360px]:right-0 max-[1360px]:z-30 max-[1360px]:flex max-[1360px]:w-[min(340px,92vw)] max-[1360px]:[box-shadow:var(--float)]"
          : "max-[1360px]:hidden",
      )}
    >
      {sobreposto && (
        <IconButton
          size="sm"
          title="Fechar o painel do cliente"
          aria-label="Fechar o painel do cliente"
          onClick={onFechar}
          className="absolute right-3 top-3 z-[1] min-[1361px]:hidden max-[860px]:h-10 max-[860px]:w-10"
        >
          <Icone nome="fechar" />
        </IconButton>
      )}

      <ContextoCard dados={dados} onEtiquetas={onSalvo} />

      {dono && (
        <Secao id="contrato" titulo="Contrato" aberta={abertas.contrato} onAlternar={alternar}>
          <Pares
            itens={[
              {
                rotulo: "Situação",
                valor: (
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("h-2 w-2 rounded-full", PONTO[dono.resumo.estado.tom])} aria-hidden />
                    {dono.resumo.estado.rotulo}
                  </span>
                ),
              },
              ...(dono.resumo.valor
                ? [
                    {
                      rotulo: "Plano",
                      valor: (() => {
                        const [periodo, preco] = (dono.resumo.valor as string).split(" · ");
                        return (
                          <>
                            {periodo} · <span className="font-mono tabular-nums">{preco}</span>
                          </>
                        );
                      })(),
                    },
                  ]
                : []),
              ...(dono.resumo.inicio ? [{ rotulo: "Início", valor: dono.resumo.inicio }] : []),
              ...(dono.resumo.renova ? [{ rotulo: "Renova", valor: dono.resumo.renova }] : []),
              {
                rotulo: "Entregas",
                valor: (
                  <>
                    <span className="font-mono tabular-nums">{dono.entregas.d30}</span> em 30 dias,{" "}
                    <span className="font-mono tabular-nums">{dono.entregas.total}</span> no total
                  </>
                ),
              },
            ]}
          />
          {/* Mensagens do cliente em 30 dias contra o limite do plano; sem limite, a contagem e o aviso na mesma linha. */}
          {dono.limiteMensagens !== null ? (
            <MedidorUso
              className="mt-4"
              rotulo="Mensagens em 30 dias"
              rotuloAcessivel="Mensagens do cliente em 30 dias"
              valor={dono.mensagensCliente30d}
              limite={dono.limiteMensagens}
            />
          ) : (
            <div className="mt-4 flex items-baseline justify-between gap-2 text-[12.5px] text-fg-dim">
              <span className="min-w-0 truncate">Mensagens em 30 dias</span>
              <span className="whitespace-nowrap">
                <b className="font-mono font-medium tabular-nums text-fg">{new Intl.NumberFormat("pt-BR").format(dono.mensagensCliente30d)}</b>
                {" · "}
                <MedidorUso valor={dono.mensagensCliente30d} limite={null} />
              </span>
            </div>
          )}
          {dono.contrato?.nota && <p className="mt-3 text-[12.5px] leading-relaxed text-fg-dim">{dono.contrato.nota}</p>}
          <Button variant="ghost" size="sm" className="-ml-2.5 mt-2" aria-expanded={editandoContrato} onClick={() => setEditandoContrato((v) => !v)}>
            {editandoContrato ? "Fechar edição" : "Editar contrato"}
          </Button>
          {editandoContrato && <ContratoForm slug={dados.slug} aoSalvar={onSalvo} />}
        </Secao>
      )}

      <Secao
        id="pessoas"
        titulo="Pessoas"
        fim={<span className="font-mono tabular-nums">{dados.pessoas.length}</span>}
        aberta={abertas.pessoas}
        onAlternar={alternar}
      >
        {pessoas.length === 0 ? (
          <p className="text-[13px] text-fg-faint">Ninguém do outro lado escreveu ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {pessoas.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 text-[13px]"
                title={`${p.mensagens} ${p.mensagens === 1 ? "mensagem" : "mensagens"}, a última ${quandoCurto(p.ultimaEm, agora)}`}
              >
                <Avatar nome={p.nome} tipo="dm" tamanho="xs" />
                <span className="min-w-0 flex-1 truncate text-fg">{p.nome}</span>
                {dono && p.papel === "team" && <span className="text-[12px] text-fg-faint">time</span>}
                <span className="font-mono text-[12px] tabular-nums text-fg-faint">{p.mensagens}</span>
              </li>
            ))}
          </ul>
        )}
        {outras > 0 && (
          <p className="mt-2.5 text-[12.5px] text-fg-faint">
            e mais <span className="font-mono tabular-nums">{outras}</span> {outras === 1 ? "pessoa" : "pessoas"}
          </p>
        )}
        {dono && (
          <Pares
            className="mt-4"
            itens={[
              {
                rotulo: "Equipe",
                valor:
                  dono.equipe.length > 0 ? (
                    <span className="flex flex-col gap-1.5">
                      {dono.equipe.map((u) => (
                        <span key={u.login} className="flex items-center gap-2">
                          <Avatar nome={u.nome} tipo="dm" tamanho="xs" />
                          <span className="min-w-0 truncate">{u.nome} atende este chat</span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-fg-faint">
                      ninguém,{" "}
                      <Link href="/equipe" className="text-accent hover:underline">
                        liberar em Equipe
                      </Link>
                    </span>
                  ),
              },
              { rotulo: "Envio da IA", valor: dono.autonomo ? "autônomo" : "com confirmação" },
            ]}
          />
        )}
      </Secao>

      {dono && (
        <Secao id="notas" titulo="Notas" fim={<EstadoNotas notas={notas} />} aberta={abertas.notas} onAlternar={alternar}>
          <NotesPanel notas={notas} nome={dados.nome} />
        </Secao>
      )}

      {dono && (
        <Secao id="copiloto" titulo="Copiloto" aberta={abertas.copiloto} onAlternar={alternar}>
          <CopilotPanel slug={dados.slug} onDraft={onDraft} />
        </Secao>
      )}

      <Secao
        id="midia"
        titulo="Mídia e arquivos"
        fim={<span className="font-mono tabular-nums">{dados.midia.total}</span>}
        aberta={abertas.midia}
        onAlternar={alternar}
      >
        {dados.midia.total === 0 ? (
          <p className="text-[13px] text-fg-faint">Nenhuma foto, áudio ou arquivo nesta conversa.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              {dados.midia.recentes.map((m) => (
                <Miniatura key={m.id} m={m} />
              ))}
            </div>
            {dados.midia.total > dados.midia.recentes.length && (
              <p className="mt-2.5 text-[12.5px] text-fg-faint">
                As <span className="font-mono tabular-nums">{dados.midia.recentes.length}</span> mais recentes de{" "}
                <span className="font-mono tabular-nums">{dados.midia.total}</span>.
              </p>
            )}
          </>
        )}
      </Secao>
    </aside>
  );
}
