"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { iniciais, tipoPeloSlug } from "@/lib/aparencia";
import type { GroupSummary } from "@/lib/data";
import { PontoDeConexao, useStatusColetor } from "./ConnectionDot";
import { MenuConta } from "./MenuConta";
import { useRotas } from "./RotasPainel";
import { Avatar } from "./ui/Avatar";

const icone = (d: React.ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

const SECOES: Array<{ href: string; rotulo: string; ativa: (p: string) => boolean; icone: React.ReactNode }> = [
  {
    href: "/",
    rotulo: "Hoje",
    ativa: (p) => p === "/",
    icone: icone(
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>,
    ),
  },
  {
    href: "/inbox",
    rotulo: "Caixa",
    ativa: (p) => p.startsWith("/inbox") || p.startsWith("/g/"),
    icone: icone(
      <>
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </>,
    ),
  },
  {
    href: "/clientes",
    rotulo: "Clientes",
    ativa: (p) => p.startsWith("/clientes"),
    icone: icone(
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>,
    ),
  },
  {
    href: "/agenda",
    rotulo: "Agenda",
    ativa: (p) => p.startsWith("/agenda"),
    icone: icone(
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>,
    ),
  },
  {
    href: "/dashboard",
    rotulo: "Painel",
    ativa: (p) => p.startsWith("/dashboard"),
    icone: icone(
      <>
        <path d="M3 3v18h18" />
        <path d="m7 15 4-4 3 3 5-6" />
      </>,
    ),
  },
];

const ITEM_BASE =
  "relative flex flex-col items-center gap-1 rounded-[10px] text-[11px] font-medium leading-none transition-colors " +
  "before:absolute before:left-[-6px] before:top-1/2 before:-mt-3.5 before:h-7 before:w-1 before:origin-center before:rounded-r before:bg-ink " +
  "before:scale-y-0 before:transition-transform before:duration-200 hover:before:scale-y-[.36] motion-reduce:before:transition-none " +
  "max-[860px]:before:hidden";

/**
 * Trilho de 72 px: seções, clientes fixados (avatar com contador, como os servidores
 * no Discord), busca e o avatar do operador com o menu. No celular vira barra inferior.
 */
export function Trilho({ groups, usuario }: { groups: GroupSummary[]; usuario: string }) {
  const pathname = usePathname();
  const rotas = useRotas();
  const { open, pairing } = useStatusColetor();
  const estadoConexao = open ? "conectado" : pairing ? "pareando" : "desconectado";
  const [menu, setMenu] = useState<null | "trilho" | "barra">(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const gatilhoBarra = useRef<HTMLButtonElement>(null);

  const fecharMenu = useCallback(() => {
    const quem = menu === "barra" ? gatilhoBarra.current : gatilho.current;
    setMenu(null);
    quem?.focus();
  }, [menu]);

  const naoLidas = groups.filter((g) => !g.archived && !g.muted && g.unread > 0).length;
  const fixados = groups.filter((g) => g.pinned && !g.archived).slice(0, 5);

  return (
    <nav
      aria-label="Seções"
      className="relative flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-line bg-rail px-1.5 pb-3 pt-3.5 max-[860px]:w-full max-[860px]:flex-row max-[860px]:justify-around max-[860px]:border-r-0 max-[860px]:border-t max-[860px]:px-1 max-[860px]:pb-[calc(6px+env(safe-area-inset-bottom,0px))] max-[860px]:pt-1.5"
    >
      <Link
        href="/"
        aria-label="Balcão, início"
        className="relative mb-3.5 grid h-8 w-8 place-items-center rounded-[9px] bg-ink max-[860px]:hidden"
      >
        <span className="h-[3px] w-3.5 rounded-sm bg-on-ink shadow-[0_-6px_0_-0.5px_color-mix(in_srgb,var(--color-on-ink)_55%,transparent)]" />
        <span data-conexao className="absolute -right-1 -top-1 grid place-items-center rounded-full bg-rail p-[3px]">
          <PontoDeConexao open={open} pairing={pairing} />
        </span>
      </Link>

      {SECOES.map((s) => {
        const ativa = s.ativa(pathname);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={ativa ? "page" : undefined}
            className={`${ITEM_BASE} w-[60px] pb-1.5 pt-2 max-[860px]:w-auto max-[860px]:max-w-[76px] max-[860px]:flex-1 ${
              ativa
                ? "bg-accent-soft text-fg before:scale-y-100 [&_svg]:text-accent"
                : "text-fg-faint hover:bg-elevated hover:text-fg"
            }`}
          >
            {s.icone}
            {s.rotulo}
            {s.href === "/inbox" && naoLidas > 0 && (
              <span className="absolute right-[9px] top-[3px] min-w-[18px] rounded-full bg-accent px-[5px] font-mono text-[10.5px] font-medium leading-[18px] text-accent-ink shadow-[0_0_0_2px_var(--color-rail)] max-[860px]:right-[calc(50%-22px)]">
                {naoLidas > 99 ? "99+" : naoLidas}
              </span>
            )}
          </Link>
        );
      })}

      {fixados.length > 0 && (
        <div
          aria-label="Clientes fixados"
          className="relative mt-2 flex flex-col items-center gap-2 pt-3 before:absolute before:left-1/2 before:top-0 before:-ml-3.5 before:h-0.5 before:w-7 before:rounded-full before:bg-line max-[860px]:hidden [@media(max-height:640px)]:hidden"
        >
          {fixados.map((g) => (
            <Link
              key={g.slug}
              href={rotas.chat(g.slug)}
              title={g.unread > 0 ? `${g.name}, ${g.unread} não lidas` : g.name}
              aria-label={g.name}
              aria-current={pathname === rotas.chat(g.slug) ? "page" : undefined}
              className="group relative block"
            >
              <Avatar
                nome={g.name}
                tipo={tipoPeloSlug(g.slug)}
                fotoUrl={g.avatarPath ? rotas.midia(g.avatarPath) : null}
                tamanho="lg"
                className="!rounded-full transition-[border-radius] duration-200 group-hover:!rounded-[12px] group-focus-visible:!rounded-[12px] motion-reduce:transition-none"
              />
              {g.unread > 0 && !g.muted && (
                <span className="absolute -bottom-[3px] -right-1 min-w-[18px] rounded-full bg-danger px-[5px] text-center font-mono text-[10.5px] font-semibold leading-[18px] text-on-ink shadow-[0_0_0_3px_var(--color-rail)]">
                  {g.unread > 99 ? "99+" : g.unread}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      <span className="flex-1 max-[860px]:hidden" />

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("cmdk:open"))}
        aria-label="Buscar ou ir para, atalho Command K"
        className={`${ITEM_BASE} w-[60px] pb-1.5 pt-2 text-fg-faint hover:bg-elevated hover:text-fg max-[860px]:hidden`}
      >
        {icone(
          <>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </>,
        )}
        Buscar
      </button>

      <div className="relative max-[860px]:hidden">
        <button
          ref={gatilho}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menu === "trilho"}
          onClick={() => setMenu((m) => (m === "trilho" ? null : "trilho"))}
          title={`${usuario}, coletor ${estadoConexao}`}
          aria-label={`Conta de ${usuario}, coletor ${estadoConexao}`}
          className="relative mt-1.5 grid h-8 w-8 place-items-center rounded-[9px] border border-line bg-elevated text-xs font-semibold text-fg-dim hover:text-fg"
        >
          {iniciais(usuario)}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-[9px] w-[9px] rounded-full shadow-[0_0_0_2px_var(--color-rail)] ${open ? "bg-ok" : pairing ? "bg-accent" : "bg-danger"}`}
          />
        </button>
        <MenuConta usuario={usuario} aberto={menu === "trilho"} onFechar={fecharMenu} ancora="trilho" gatilho={gatilho} />
      </div>

      <div className="relative hidden max-[860px]:flex max-[860px]:max-w-[76px] max-[860px]:flex-1">
        <button
          ref={gatilhoBarra}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menu === "barra"}
          onClick={() => setMenu((m) => (m === "barra" ? null : "barra"))}
          aria-label={`Mais, coletor ${estadoConexao}`}
          className={`${ITEM_BASE} w-full pb-1.5 pt-2 text-fg-faint hover:bg-elevated hover:text-fg`}
        >
          {icone(
            <>
              <circle cx="5" cy="12" r="1" />
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
            </>,
          )}
          Mais
          <span data-conexao className="absolute right-[calc(50%-16px)] top-[5px]" title={`Coletor ${estadoConexao}`}>
            <PontoDeConexao open={open} pairing={pairing} />
          </span>
        </button>
        <MenuConta usuario={usuario} aberto={menu === "barra"} onFechar={fecharMenu} ancora="barra" gatilho={gatilhoBarra} />
      </div>
    </nav>
  );
}
