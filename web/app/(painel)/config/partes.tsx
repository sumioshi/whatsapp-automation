"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mensagemDe } from "@/app/components/pedirJson";
import { Aviso, Button, Icone, Input } from "@/app/components/ui";

/** Campo numérico com a unidade "min" dentro, à direita. */
export function CampoMinutos({
  id,
  valor,
  aoMudar,
  invalido,
}: {
  id: string;
  valor: string;
  aoMudar: (v: string) => void;
  invalido?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={invalido || undefined}
        className="pr-12 font-mono tabular-nums"
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12.5px] text-fg-faint">min</span>
    </div>
  );
}

type EstadoSalvar = "ocioso" | "salvando" | "salvo" | "erro";

/** Ciclo de um "Salvar": salvando → salvo (some sozinho) ou erro com a mensagem do servidor. */
export function useSalvar() {
  const [estado, setEstado] = useState<EstadoSalvar>("ocioso");
  const [erro, setErro] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const rodar = useCallback(async (acao: () => Promise<unknown>): Promise<boolean> => {
    clearTimeout(timer.current);
    setEstado("salvando");
    setErro(null);
    try {
      await acao();
      setEstado("salvo");
      timer.current = setTimeout(() => setEstado("ocioso"), 2500);
      return true;
    } catch (e) {
      setEstado("erro");
      setErro(mensagemDe(e));
      return false;
    }
  }, []);

  return { estado, erro, rodar, salvando: estado === "salvando" };
}

/** Rodapé de card de formulário: informação à esquerda, retorno do salvar e o botão à direita. */
export function RodapeSalvar({
  info,
  estado,
  erro,
  alterado,
  aoSalvar,
  rotulo = "Salvar",
}: {
  info?: React.ReactNode;
  estado: EstadoSalvar;
  erro: string | null;
  /** Há mudança não salva: o botão vira a ação principal. */
  alterado: boolean;
  aoSalvar: () => void;
  rotulo?: string;
}) {
  return (
    <>
      <span className="min-w-0 truncate">{info}</span>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <span aria-live="polite" className="text-[12.5px]">
          {estado === "salvo" && (
            <span className="inline-flex items-center gap-1 text-ok">
              <Icone nome="check" tamanho={14} />
              Salvo
            </span>
          )}
          {estado === "erro" && <span className="text-danger">{erro}</span>}
          {estado !== "salvo" && estado !== "erro" && alterado && <span className="text-fg-faint">Alterações não salvas</span>}
        </span>
        <Button size="sm" variant={alterado ? "primary" : "subtle"} loading={estado === "salvando"} onClick={aoSalvar}>
          {rotulo}
        </Button>
      </div>
    </>
  );
}

/** Corpo de card enquanto os dados chegam: barras discretas no lugar do conteúdo. */
export function Carregando({ linhas = 3, rotulo = "Carregando…" }: { linhas?: number; rotulo?: string }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-2.5 py-1">
      <span className="sr-only">{rotulo}</span>
      {Array.from({ length: linhas }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: barras fixas, sem identidade
          key={i}
          aria-hidden
          className="h-3 animate-pulse rounded-full bg-elevated motion-reduce:animate-none"
          style={{ width: `${[72, 54, 64, 46][i % 4]}%` }}
        />
      ))}
    </div>
  );
}

/** Falha ao carregar o card, com a mensagem e um "Tentar de novo". */
export function FalhaAoCarregar({ erro, aoTentar }: { erro: string; aoTentar: () => void }) {
  return (
    <Aviso
      tom="erro"
      acoes={
        <Button size="sm" variant="subtle" onClick={aoTentar}>
          Tentar de novo
        </Button>
      }
    >
      {erro}
    </Aviso>
  );
}
