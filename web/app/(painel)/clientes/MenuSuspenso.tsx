"use client";

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/app/components/ui";

const ITENS = "[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio]";

/**
 * Botão que abre uma lista de opções (visão, filtro, ordem, colunas). Setas movem,
 * Esc fecha e devolve o foco ao botão, Tab e clique fora fecham.
 */
export function MenuSuspenso({
  rotulo,
  conteudoGatilho,
  classeGatilho,
  alinhar = "esquerda",
  largura = "w-64",
  children,
}: {
  /** Nome do menu para leitor de tela ("Ordenar clientes"). */
  rotulo: string;
  conteudoGatilho: ReactNode;
  classeGatilho: string;
  alinhar?: "esquerda" | "direita";
  largura?: string;
  children: (fechar: () => void) => ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const fechar = useCallback(() => {
    setAberto(false);
    botao.current?.focus();
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const itens = () => [...(menu.current?.querySelectorAll<HTMLElement>(ITENS) ?? [])];
    (itens().find((el) => el.getAttribute("aria-checked") === "true") ?? itens()[0])?.focus();
    const tecla = (e: KeyboardEvent) => {
      const lista = itens();
      const i = lista.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape") {
        e.preventDefault();
        fechar();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        lista[(i + (e.key === "ArrowDown" ? 1 : -1) + lista.length) % lista.length]?.focus();
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        (e.key === "Home" ? lista[0] : lista[lista.length - 1])?.focus();
      } else if (e.key === "Tab") {
        setAberto(false);
      }
    };
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (botao.current?.contains(alvo) || menu.current?.contains(alvo)) return;
      setAberto(false);
    };
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fora);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fora);
    };
  }, [aberto, fechar]);

  return (
    <div className="relative">
      <button
        ref={botao}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        onClick={() => setAberto((a) => !a)}
        className={classeGatilho}
      >
        {conteudoGatilho}
      </button>
      {aberto && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={rotulo}
          className={cn(
            "pop-in absolute top-[calc(100%+6px)] z-40 max-h-[min(420px,70vh)] max-w-[calc(100vw-32px)] overflow-y-auto rounded-[12px] border border-line bg-surface p-1.5 [box-shadow:var(--float)]",
            alinhar === "direita" ? "right-0" : "left-0",
            largura,
          )}
        >
          {children(fechar)}
        </div>
      )}
    </div>
  );
}

const ITEM =
  "flex min-h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13px] text-fg outline-none hover:bg-elevated focus-visible:bg-elevated";

/** Opção do menu. Com `marcado` vira item de escolha (rádio) ou de liga/desliga (caixa). */
export function ItemMenu({
  children,
  aoEscolher,
  marcado,
  tipo = "acao",
  dica,
}: {
  children: ReactNode;
  aoEscolher: () => void;
  marcado?: boolean;
  tipo?: "acao" | "radio" | "caixa";
  /** Texto menor à direita ou embaixo ("inclui as pessoais"). */
  dica?: ReactNode;
}) {
  const role = tipo === "radio" ? "menuitemradio" : tipo === "caixa" ? "menuitemcheckbox" : "menuitem";
  return (
    <button
      type="button"
      role={role}
      aria-checked={tipo === "acao" ? undefined : Boolean(marcado)}
      onClick={aoEscolher}
      className={ITEM}
    >
      {tipo !== "acao" && (
        <span
          aria-hidden
          className={cn(
            "grid h-4 w-4 shrink-0 place-items-center border",
            tipo === "radio" ? "rounded-full" : "rounded-[4px]",
            marcado ? "border-accent bg-accent text-accent-ink" : "border-line-2 bg-surface",
          )}
        >
          {marcado &&
            (tipo === "radio" ? (
              <span className="h-1.5 w-1.5 rounded-full bg-accent-ink" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ))}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {dica && <span className="block truncate text-[12px] text-fg-faint">{dica}</span>}
      </span>
    </button>
  );
}

export function SecaoMenu({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pb-1 pt-2 text-[12px] font-medium text-fg-faint">{children}</p>;
}

export function DivisorMenu() {
  return <div className="my-1 h-px bg-line" role="separator" />;
}
