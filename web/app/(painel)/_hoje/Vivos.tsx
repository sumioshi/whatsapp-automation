"use client";

import { useStatusColetor } from "@/app/components/ConnectionDot";
import { type EstadoColetor, compromissosRestantes, fraseDoDia, resumoDaFila, textoDaFila } from "@/lib/hoje";
import { useHoje } from "./ProvedorHoje";

/** A frase do cabeçalho: o que vem da nuvem entra quando chega (e fica de fora se não chegar). */
export function FraseDoDia({ esperando }: { esperando: number }) {
  const { agoraMs, fila, agenda } = useHoje();
  return (
    <>
      {fraseDoDia({
        esperando,
        comIa: fila.tipo === "ok" ? resumoDaFila(fila.tickets).total : null,
        compromissos: agenda.tipo === "ok" ? compromissosRestantes(agenda.eventos, agoraMs) : null,
      })}
    </>
  );
}

const COR_COLETOR: Record<EstadoColetor, string> = {
  conectado: "var(--color-ok)",
  pareando: "var(--color-accent)",
  desconectado: "var(--color-danger)",
};

/**
 * Estado do coletor: começa com a leitura do servidor e passa a seguir a mesma
 * consulta de 5 s do ponto de conexão do trilho.
 */
export function ValorColetor({ inicial, grupos }: { inicial: EstadoColetor; grupos: number }) {
  const vivo = useStatusColetor();
  const estado: EstadoColetor = !vivo.carregado ? inicial : vivo.open ? "conectado" : vivo.pairing ? "pareando" : "desconectado";
  const cor = COR_COLETOR[estado];
  return (
    <>
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 self-center rounded-full"
        style={{ background: cor, boxShadow: `0 0 0 3px color-mix(in srgb, ${cor} 22%, transparent)` }}
      />
      <span className="font-sans text-[17px] font-semibold leading-[26px] tracking-[-0.01em]">{estado}</span>
      <small className="truncate font-sans text-[12.5px] font-normal tracking-normal text-fg-faint">
        {grupos} {grupos === 1 ? "grupo" : "grupos"}
      </small>
    </>
  );
}

/** Quantas conversas a IA tem na fila agora e o que vem em seguida. */
export function ValorComIa() {
  const { fila } = useHoje();
  if (fila.tipo === "carregando") {
    return <small className="font-sans text-[12.5px] font-normal tracking-normal text-fg-faint">lendo a fila…</small>;
  }
  const resumo = fila.tipo === "ok" ? resumoDaFila(fila.tickets) : null;
  return (
    <>
      {resumo ? resumo.total : "—"}
      <small className="truncate font-sans text-[12.5px] font-normal tracking-normal text-fg-faint">{textoDaFila(resumo)}</small>
    </>
  );
}
