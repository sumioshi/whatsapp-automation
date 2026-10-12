"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePromptInstalacao } from "./InstallButton";
import { useTema } from "./ThemeToggle";

const LINKS: Array<{ href: string; rotulo: string }> = [
  { href: "/equipe", rotulo: "Equipe" },
  { href: "/links", rotulo: "Links de projeto" },
  { href: "/novo?modo=contato", rotulo: "Contatos" },
  { href: "/config", rotulo: "Configurações" },
];

const ITEM =
  "flex h-9 w-full items-center gap-2.5 rounded-[8px] px-3 text-left text-[13.5px] text-fg outline-none hover:bg-elevated focus-visible:bg-elevated";

/**
 * Menu da conta (avatar no trilho, "Mais" na barra do celular): seções secundárias,
 * tema e sair. Setas movem, Esc fecha e devolve o foco a quem abriu, clique fora fecha.
 */
export function MenuConta({
  usuario,
  aberto,
  onFechar,
  ancora,
}: {
  usuario: string;
  aberto: boolean;
  onFechar: () => void;
  ancora: "trilho" | "barra";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { escuro, alternar } = useTema();
  const { podeInstalar, instalar } = usePromptInstalacao();

  useEffect(() => {
    if (!aberto) return;
    const itens = () => [...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    itens()[0]?.focus();
    const tecla = (e: KeyboardEvent) => {
      const lista = itens();
      const i = lista.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape") {
        e.preventDefault();
        onFechar();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const prox = (i + (e.key === "ArrowDown" ? 1 : -1) + lista.length) % lista.length;
        lista[prox]?.focus();
      } else if (e.key === "Tab") {
        onFechar();
      }
    };
    const fora = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onFechar();
    };
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fora);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fora);
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const posicao = ancora === "trilho" ? "left-[64px] bottom-2" : "right-2 bottom-[calc(100%+8px)]";

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Conta e seções"
      className={`pop-in absolute z-50 w-60 rounded-[12px] border border-line bg-surface p-1.5 [box-shadow:var(--float)] ${posicao}`}
    >
      <div className="px-3 pb-2 pt-1.5 text-[12.5px] text-fg-faint">
        Conectado como <span className="font-medium text-fg">{usuario}</span>
      </div>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} role="menuitem" className={ITEM} onClick={onFechar}>
          {l.rotulo}
        </Link>
      ))}
      <div className="my-1 h-px bg-line" />
      {podeInstalar && (
        <button
          type="button"
          role="menuitem"
          className={ITEM}
          onClick={() => {
            instalar();
            onFechar();
          }}
        >
          Instalar app
        </button>
      )}
      <button type="button" role="menuitem" className={ITEM} onClick={alternar}>
        {escuro ? "Tema claro" : "Tema escuro"}
      </button>
      <button
        type="button"
        role="menuitem"
        className={`${ITEM} text-danger`}
        onClick={async () => {
          await fetch("/api/logout", { method: "POST" }).catch(() => {});
          window.location.assign("/login");
        }}
      >
        Sair
      </button>
    </div>
  );
}
