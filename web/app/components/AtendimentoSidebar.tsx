"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { iniciais } from "@/lib/aparencia";
import { Icone } from "./ui";
import { PontoDeConexao, useStatusColetor } from "./ConnectionDot";
import { useTema } from "./ThemeToggle";

const ITEM =
  "relative flex w-[60px] flex-col items-center gap-1 rounded-[10px] pb-1.5 pt-2 text-[11px] font-medium leading-none transition-colors " +
  "max-[860px]:w-auto max-[860px]:max-w-[96px] max-[860px]:flex-1";

/**
 * Trilho da área da equipe: a mesma moldura do painel do dono, com só o que o
 * atendente usa (a Caixa, o tema e sair) e o estado da conexão do WhatsApp.
 * No celular vira a barra de baixo.
 */
export function AtendimentoSidebar({ nome, naoLidas }: { nome: string; naoLidas: number }) {
  const pathname = usePathname();
  const { open, pairing } = useStatusColetor();
  const { escuro, alternar } = useTema();
  const estado = open ? "conectado" : pairing ? "pareando" : "desconectado";
  const naCaixa = pathname === "/atendimento" || pathname.startsWith("/atendimento/");

  return (
    <nav
      aria-label="Seções"
      className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-line bg-rail px-1.5 pb-3 pt-3.5 max-[860px]:w-full max-[860px]:flex-row max-[860px]:justify-around max-[860px]:border-r-0 max-[860px]:border-t max-[860px]:px-1 max-[860px]:pb-[calc(6px+env(safe-area-inset-bottom,0px))] max-[860px]:pt-1.5"
    >
      <Link
        href="/atendimento"
        aria-label="Balcão, caixa de entrada"
        className="relative mb-3.5 grid h-8 w-8 place-items-center rounded-[9px] bg-ink max-[860px]:hidden"
      >
        <span className="h-[3px] w-3.5 rounded-sm bg-on-ink shadow-[0_-6px_0_-0.5px_color-mix(in_srgb,var(--color-on-ink)_55%,transparent)]" />
        <span className="absolute -right-1 -top-1 grid place-items-center rounded-full bg-rail p-[3px]">
          <PontoDeConexao open={open} pairing={pairing} />
        </span>
      </Link>

      <Link
        href="/atendimento"
        aria-current={naCaixa ? "page" : undefined}
        className={`${ITEM} ${naCaixa ? "bg-accent-soft text-fg [&_svg]:text-accent" : "text-fg-faint hover:bg-elevated hover:text-fg"}`}
      >
        <Icone nome="inbox" tamanho={20} />
        Caixa
        {naoLidas > 0 && (
          <span className="absolute right-[9px] top-[3px] min-w-[18px] rounded-full bg-accent px-[5px] text-center font-mono text-[10.5px] font-medium leading-[18px] text-accent-ink shadow-[0_0_0_2px_var(--color-rail)] max-[860px]:right-[calc(50%-22px)]">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </Link>

      <span className="flex-1 max-[860px]:hidden" />

      <button type="button" onClick={alternar} className={`${ITEM} text-fg-faint hover:bg-elevated hover:text-fg`}>
        <Icone nome={escuro ? "sun" : "moon"} tamanho={20} />
        Tema
      </button>
      <button
        type="button"
        onClick={async () => {
          await fetch("/api/logout", { method: "POST" }).catch(() => {});
          window.location.assign("/login");
        }}
        className={`${ITEM} text-fg-faint hover:bg-elevated hover:text-danger`}
      >
        <Icone nome="logout" tamanho={20} />
        Sair
      </button>

      <span
        title={`${nome}, WhatsApp ${estado}`}
        aria-label={`${nome}, WhatsApp ${estado}`}
        role="img"
        className="relative mt-1.5 grid h-8 w-8 place-items-center rounded-[9px] border border-line bg-elevated text-xs font-semibold text-fg-dim max-[860px]:hidden"
      >
        {iniciais(nome)}
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-[9px] w-[9px] rounded-full shadow-[0_0_0_2px_var(--color-rail)] ${open ? "bg-ok" : pairing ? "bg-accent" : "bg-danger"}`}
        />
      </span>
    </nav>
  );
}

/** Faixa de aviso no topo da fila quando o WhatsApp cai: o que o atendente escrever não sai. */
export function AvisoDesconectado() {
  const coletor = useStatusColetor();
  if (!coletor.carregado || coletor.open) return null;
  return (
    <p role="alert" className="flex items-start gap-2 border-b border-line bg-danger-bg px-5 py-2.5 text-[12.5px] text-danger max-[860px]:px-4">
      <Icone nome="alert" tamanho={15} className="mt-px shrink-0" />
      O WhatsApp está desconectado. As mensagens não saem até reconectar.
    </p>
  );
}
