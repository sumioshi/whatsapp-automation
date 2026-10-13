"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

/**
 * Ação que pede confirmação no próprio lugar ("Apagar…" vira "Apagar a conta de Ana?
 * [Apagar conta] [Cancelar]"), sem caixa de diálogo do navegador. O foco vai para o
 * botão que confirma; Esc ou Cancelar desistem.
 */
export function BotaoConfirmar({
  children,
  pergunta,
  confirmar,
  aoConfirmar,
  variante = "ghost",
  perigo = true,
  size = "sm",
  disabled,
  className,
}: {
  /** Rótulo do botão antes de confirmar ("Apagar…"). */
  children: ReactNode;
  /** Pergunta curta mostrada na confirmação. */
  pergunta: ReactNode;
  /** Rótulo do botão que confirma ("Apagar conta"). */
  confirmar: string;
  aoConfirmar: () => void | Promise<void>;
  variante?: "subtle" | "ghost" | "danger";
  /** O botão que confirma é vermelho (ação destrutiva). */
  perigo?: boolean;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}) {
  const [pedindo, setPedindo] = useState(false);
  const [rodando, setRodando] = useState(false);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  const abrirRef = useRef<HTMLButtonElement>(null);
  const voltarFoco = useRef(false);

  useEffect(() => {
    if (pedindo) confirmarRef.current?.focus();
    else if (voltarFoco.current) {
      voltarFoco.current = false;
      abrirRef.current?.focus();
    }
  }, [pedindo]);

  function desistir() {
    voltarFoco.current = true;
    setPedindo(false);
  }

  async function confirmarAgora() {
    setRodando(true);
    try {
      await aoConfirmar();
    } finally {
      setRodando(false);
      setPedindo(false);
    }
  }

  if (!pedindo) {
    return (
      <Button ref={abrirRef} variant={variante} size={size} disabled={disabled} className={className} onClick={() => setPedindo(true)}>
        {children}
      </Button>
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Esc desiste da confirmação
    <span
      role="group"
      className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1.5", className)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          desistir();
        }
      }}
    >
      <span className="text-[12.5px] text-fg-dim">{pergunta}</span>
      <Button ref={confirmarRef} variant={perigo ? "danger" : "primary"} size={size} loading={rodando} onClick={() => void confirmarAgora()}>
        {confirmar}
      </Button>
      <Button variant="ghost" size={size} disabled={rodando} onClick={desistir}>
        Cancelar
      </Button>
    </span>
  );
}
