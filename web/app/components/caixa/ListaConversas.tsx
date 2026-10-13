"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fracaoAnel, nivelEspera } from "@/lib/aparencia";
import {
  type AguardandoOk,
  type ConversaFila,
  type EntregaViva,
  type EsperaFila,
  type SecaoFila,
  type VistaFila,
  montarFila,
} from "@/lib/caixa";
import { useRotas } from "../RotasPainel";
import { Button, Segmentado, cn, Icone } from "../ui";
import { Kbd } from "../ui/Kbd";
import { useListNav } from "../useListNav";
import { InboxItem } from "./InboxItem";

export interface DadosCaixa {
  esperando: EsperaFila[];
  conversas: ConversaFila[];
  entregas: EntregaViva[];
  aguardandoOk: AguardandoOk[];
  /** Relógio do servidor na montagem: a primeira pintura usa ele, sem diferença na hidratação. */
  geradoEm: number;
}

const CHAVE_VISTA = "wac-caixa-vista";
const CIRCUNFERENCIA = 2 * Math.PI * 6;
const COR_NIVEL = { neutro: "text-fg-faint", atencao: "text-warn", urgente: "text-danger" } as const;

/** Anel da seção "Esperando você": a cor e o preenchimento seguem a espera mais antiga. */
function AnelSecao({ ms }: { ms: number }) {
  const fracao = fracaoAnel(ms);
  return (
    <svg viewBox="0 0 16 16" className={cn("h-3.5 w-3.5 shrink-0 overflow-visible", COR_NIVEL[nivelEspera(ms)])} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="8" cy="8" r="6" opacity="0.22" />
      {fracao < 1 ? (
        <circle cx="8" cy="8" r="6" strokeLinecap="round" strokeDasharray={`${Math.max(2, fracao * CIRCUNFERENCIA).toFixed(1)} 99`} transform="rotate(-90 8 8)" />
      ) : (
        <>
          <circle cx="8" cy="8" r="6" />
          <circle cx="8" cy="8" r="2.6" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}

const ICONE_SECAO = { ia: "spark", fixadas: "pin", conversas: "chat", arquivadas: "archive" } as const;

function CabecalhoSecao({
  secao,
  agoraMs,
  onAlternar,
}: {
  secao: SecaoFila;
  agoraMs: number;
  onAlternar?: () => void;
}) {
  const desde = secao.linhas.map((l) => (l.esperaDesde ? Date.parse(l.esperaDesde) : Number.NaN)).filter(Number.isFinite);
  const maiorEspera = desde.length ? Math.max(0, agoraMs - Math.min(...desde)) : 0;
  // A régua da espera por extenso, no title da seção: quantos em cada faixa.
  const faixas = { urgente: 0, atencao: 0, neutro: 0 };
  for (const d of desde) faixas[nivelEspera(agoraMs - d)] += 1;
  const regua =
    secao.id === "esperando" && desde.length > 0
      ? [
          faixas.urgente && `${faixas.urgente} há mais de 4 h`,
          faixas.atencao && `${faixas.atencao} entre 30 min e 4 h`,
          faixas.neutro && `${faixas.neutro} há menos de 30 min`,
        ]
          .filter(Boolean)
          .join(", ")
      : undefined;
  const conteudo = (
    <>
      {secao.id === "esperando" ? (
        <AnelSecao ms={maiorEspera} />
      ) : (
        <Icone nome={ICONE_SECAO[secao.id]} tamanho={14} className={secao.id === "ia" ? "text-id-ia" : "text-fg-faint"} />
      )}
      {secao.titulo}
      <span className="font-mono font-medium tabular-nums text-fg-faint">{secao.total}</span>
      {onAlternar && (
        <Icone nome="chev-d" tamanho={14} className={cn("ml-auto text-fg-faint transition-transform motion-reduce:transition-none", secao.recolhida && "-rotate-90")} />
      )}
    </>
  );
  const cls =
    "sticky top-0 z-[1] flex h-8 w-full items-center gap-2 border-b border-line bg-surface-2 px-5 text-left text-[12px] font-semibold text-fg-dim max-[860px]:px-4";
  return onAlternar ? (
    <button type="button" aria-expanded={!secao.recolhida} onClick={onAlternar} className={cn(cls, "hover:text-fg")}>
      {conteudo}
    </button>
  ) : (
    <div className={cls} title={regua}>
      {conteudo}
      {regua && <span className="sr-only">: {regua}</span>}
    </div>
  );
}

function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-[14px] font-semibold text-fg">{titulo}</p>
      {children && <div className="mx-auto mt-1.5 max-w-[34ch] text-[13px] leading-relaxed text-fg-faint">{children}</div>}
    </div>
  );
}

/**
 * A fila da Caixa: a lista de conversas que saiu da casca. Vistas Esperando,
 * Com a IA (só o dono) e Todas, filtro por nome ou etiqueta, seções e o
 * teclado (J/K/Enter/U). Os dados de espera chegam do servidor (atualizados a
 * cada 20 s); o que a IA está fazendo vem da fila de envio a cada 10 s.
 */
export function ListaConversas({ dados, aviso, className }: { dados: DadosCaixa; aviso?: ReactNode; className?: string }) {
  const rotas = useRotas();
  const dono = rotas.modo === "dono";
  const router = useRouter();
  const pathname = usePathname();
  const [vista, setVista] = useState<VistaFila>("esperando");
  const [filtro, setFiltro] = useState("");
  const [arquivadasAbertas, setArquivadasAbertas] = useState(false);
  const [ia, setIa] = useState({ entregas: dados.entregas, aguardandoOk: dados.aguardandoOk });
  const [agora, setAgora] = useState(dados.geradoEm);
  const listaRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      const salva = window.localStorage.getItem(CHAVE_VISTA);
      if (salva === "esperando" || salva === "todas" || (salva === "ia" && dono)) setVista(salva);
    } catch {
      /* sem armazenamento: começa em Esperando */
    }
  }, [dono]);

  const mudarVista = useCallback((v: VistaFila) => {
    setVista(v);
    try {
      window.localStorage.setItem(CHAVE_VISTA, v);
    } catch {
      /* vale só nesta aba */
    }
  }, []);

  // O anel de espera anda sozinho.
  useEffect(() => {
    setAgora(Date.now());
    const id = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Quem espera e as não lidas vêm do servidor: atualiza com a aba visível.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 20_000);
    return () => clearInterval(id);
  }, [router]);

  // O que a IA está fazendo muda em segundos (balão a balão): consulta própria.
  useEffect(() => {
    if (!dono) return;
    let vivo = true;
    const buscar = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/caixa/ia", { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as { entregas?: EntregaViva[]; aguardandoOk?: AguardandoOk[] };
        if (vivo) setIa({ entregas: d.entregas ?? [], aguardandoOk: d.aguardandoOk ?? [] });
      } catch {
        /* painel reiniciando: fica o último estado */
      }
    };
    void buscar();
    const id = setInterval(buscar, 10_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [dono]);

  const fila = useMemo(
    () =>
      montarFila(
        { esperando: dados.esperando, conversas: dados.conversas, entregas: dono ? ia.entregas : [], aguardandoOk: dono ? ia.aguardandoOk : [] },
        { vista, filtro, arquivadasAbertas, agoraMs: agora },
      ),
    [dados.esperando, dados.conversas, ia, dono, vista, filtro, arquivadasAbertas, agora],
  );

  const atual = useMemo(() => {
    const m = /\/g\/([^/]+)$/.exec(pathname);
    if (!m?.[1]) return null;
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }, [pathname]);

  const itensNav = useMemo(
    () => fila.secoes.flatMap((s) => s.linhas.map((l) => ({ slug: l.slug, naoLidas: l.naoLidas }))),
    [fila],
  );
  const { navIndex, setNavIndex } = useListNav(itensNav, listaRef, atual);

  const abertas = dono ? fila.abertas : fila.contagens.esperando;
  let posicao = -1;

  return (
    <section aria-label="Caixa de entrada" className={cn("flex min-h-0 flex-col border-r border-line bg-surface max-[860px]:border-r-0", className)}>
      <header className="flex flex-col gap-3.5 border-b border-line px-5 pb-3.5 pt-5 max-[860px]:px-4 max-[860px]:pt-4">
        <div className="flex items-baseline gap-2.5">
          <h1 className="whitespace-nowrap font-title text-[24px] font-medium leading-[1.1] tracking-[-0.01em] text-fg">Caixa de entrada</h1>
          <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-fg-faint">
            {abertas === 0 ? "tudo em dia" : `${abertas} ${abertas === 1 ? "aberta" : "abertas"}`}
          </span>
          {dono && (
            <Link
              href="/novo"
              title="Nova conversa"
              aria-label="Nova conversa"
              className="-my-1.5 ml-auto grid h-8 w-8 shrink-0 place-items-center self-center rounded-control text-fg-dim transition-colors hover:bg-elevated hover:text-fg max-[860px]:h-10 max-[860px]:w-10"
            >
              <Icone nome="plus" />
            </Link>
          )}
        </div>
        <Segmentado
          rotulo="Mostrar"
          valor={vista}
          aoMudar={mudarVista}
          className="max-[860px]:[&>button]:h-9"
          opcoes={[
            { valor: "esperando" as const, rotulo: "Esperando", num: fila.contagens.esperando },
            ...(dono ? [{ valor: "ia" as const, rotulo: "Com a IA", num: fila.contagens.ia }] : []),
            { valor: "todas" as const, rotulo: "Todas" },
          ]}
        />
        <label className="flex h-[34px] items-center gap-2 rounded-control border border-line-2 bg-surface px-2.5 text-fg-faint transition-colors focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)] max-[860px]:h-10">
          <Icone nome="search" />
          <span className="sr-only">Filtrar a fila</span>
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setFiltro("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Filtrar por cliente ou etiqueta…"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-mute max-[860px]:text-[16px]"
          />
          {filtro && (
            <button
              type="button"
              onClick={() => setFiltro("")}
              aria-label="Limpar filtro"
              className="-mr-1 grid h-6 w-6 place-items-center rounded-[6px] text-fg-faint hover:bg-elevated hover:text-fg"
            >
              <Icone nome="x" tamanho={14} />
            </button>
          )}
        </label>
      </header>

      {aviso}

      <nav ref={listaRef} aria-label="Conversas da fila" className="min-h-0 flex-1 overflow-y-auto">
        {fila.ordem.length === 0 && fila.secoes.every((s) => s.id !== "arquivadas") ? (
          filtro.trim() ? (
            <Vazio titulo={`Nada encontrado para “${filtro.trim()}”`}>
              <p>Tente outro nome ou etiqueta, ou procure em Todas.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => setFiltro("")}>
                Limpar filtro
              </Button>
            </Vazio>
          ) : vista === "esperando" ? (
            <Vazio titulo="Ninguém esperando você">
              <p>Quem escrever e ficar sem resposta aparece aqui, o mais antigo primeiro.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => mudarVista("todas")}>
                Ver todas as conversas
              </Button>
            </Vazio>
          ) : vista === "ia" ? (
            <Vazio titulo="A IA não está cuidando de nenhuma conversa">
              <p>Respostas agendadas ou saindo e perguntas esperando o seu OK aparecem aqui.</p>
            </Vazio>
          ) : dono ? (
            <Vazio titulo="Nenhuma conversa ainda">
              <p>
                Conecte o WhatsApp em{" "}
                <Link href="/config" className="text-accent underline-offset-2 hover:underline">
                  Configurações
                </Link>{" "}
                e ligue a captura dos grupos que você acompanha.
              </p>
            </Vazio>
          ) : (
            <Vazio titulo="Nenhuma conversa liberada para você">
              <p>Peça ao responsável para liberar os chats que você atende.</p>
            </Vazio>
          )
        ) : (
          fila.secoes.map((s) => (
            <div key={s.id} role="group" aria-label={s.titulo}>
              <CabecalhoSecao
                secao={s}
                agoraMs={agora}
                onAlternar={s.id === "arquivadas" && !filtro.trim() ? () => setArquivadasAbertas((v) => !v) : undefined}
              />
              {s.linhas.map((l) => {
                posicao += 1;
                const i = posicao;
                return (
                  <InboxItem
                    key={`${s.id}-${l.slug}`}
                    linha={l}
                    href={rotas.chat(l.slug)}
                    fotoUrl={l.avatarPath ? rotas.midia(l.avatarPath) : null}
                    agoraMs={agora}
                    atual={l.slug === atual}
                    cursor={i === navIndex && l.slug !== atual}
                    onCursor={() => setNavIndex(i)}
                  />
                );
              })}
            </div>
          ))
        )}
      </nav>

      <footer className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-line px-5 py-2.5 text-[12px] text-fg-faint max-[860px]:hidden">
        <span className="inline-flex items-center gap-1.5">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          navegar
        </span>
        {dono && (
          <span className="inline-flex items-center gap-1.5">
            <Kbd>E</Kbd>
            resolver
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <Kbd>]</Kbd>
          painel do cliente
        </span>
      </footer>
    </section>
  );
}
