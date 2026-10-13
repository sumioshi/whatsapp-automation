import { Fragment, type ReactNode } from "react";
import { cn, AnelCheio, Icone } from "@/app/components/ui";
import type { DadosHoje } from "@/lib/hoje-atual";
import { textoEntregasAnteriores } from "@/lib/hoje";
import { partesDoTempo } from "@/lib/painel";
import { ValorColetor, ValorComIa } from "./Vivos";

/** Texto de apoio ao lado do número, na fonte de interface. */
export function Apoio({ children }: { children: ReactNode }) {
  return <small className="truncate font-sans text-[12.5px] font-normal tracking-normal text-fg-faint">{children}</small>;
}

/** Unidade depois do número: mono menor, colada nele. */
function Unidade({ children }: { children: ReactNode }) {
  return <span className="-ml-1.5 font-mono text-[15px] text-fg-dim">{children}</span>;
}

/** Tempo em "18 min" ou "1h 05m", com o número grande e a unidade menor. */
export function Tempo({ ms }: { ms: number }) {
  return (
    <>
      {partesDoTempo(ms).map((p, i) => (
        <Fragment key={p.unidade}>
          {i > 0 && " "}
          <span>{p.valor}</span>
          <Unidade>{p.unidade}</Unidade>
        </Fragment>
      ))}
    </>
  );
}

function Celula({ indice, rotulo, children }: { indice: number; rotulo: ReactNode; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2.5 border-line px-5 py-4 max-[860px]:px-4",
        indice > 0 && "border-l",
        // Abaixo de 1020 px: duas colunas, a última ocupa a linha inteira.
        "max-[1020px]:border-l-0",
        indice >= 2 && "max-[1020px]:border-t",
        indice % 2 === 1 && "max-[1020px]:border-l",
        indice === 4 && "max-[1020px]:col-span-2",
      )}
    >
      <div className="flex items-center gap-[7px] text-[12.5px] font-medium text-fg-dim [&>svg]:h-[15px] [&>svg]:w-[15px]">{rotulo}</div>
      <div className="flex items-baseline gap-2.5 whitespace-nowrap font-mono text-[26px] font-medium leading-none tracking-[-0.03em] text-fg tabular-nums">
        {children}
      </div>
    </div>
  );
}

/** Situação agora, em cinco células: coletor, quem espera, a IA, a primeira resposta e as entregas. */
export function Faixa({ d }: { d: DadosHoje }) {
  const { esperando, primeiraResposta, entregas } = d;
  return (
    <section
      aria-label="Situação agora"
      className="grid min-w-0 grid-cols-5 rounded-card border border-line bg-surface [box-shadow:var(--shadow-card)] max-[1020px]:grid-cols-2"
    >
      <Celula
        indice={0}
        rotulo={
          <>
            <Icone nome="activity" className="text-fg-faint" />
            Coletor
          </>
        }
      >
        <ValorColetor inicial={d.coletor.estado} grupos={d.coletor.grupos} />
      </Celula>
      <Celula
        indice={1}
        rotulo={
          <>
            <AnelCheio className="text-danger" />
            Esperando você
          </>
        }
      >
        {esperando.total}
        <Apoio>
          {esperando.total === 0
            ? "fila limpa"
            : esperando.acimaDe4h === 0
              ? "nenhum há mais de 4 h"
              : `${esperando.acimaDe4h} há mais de 4 h`}
        </Apoio>
      </Celula>
      <Celula
        indice={2}
        rotulo={
          <>
            <Icone nome="spark" className="text-id-ia" />
            Com a IA
          </>
        }
      >
        <ValorComIa />
      </Celula>
      <Celula
        indice={3}
        rotulo={
          <>
            <Icone nome="clock" className="text-fg-faint" />
            Primeira resposta
          </>
        }
      >
        {primeiraResposta.medianaMs === null ? (
          <>
            —<Apoio>sem respostas hoje</Apoio>
          </>
        ) : (
          <>
            <Tempo ms={primeiraResposta.medianaMs} />
            <Apoio>mediana hoje</Apoio>
          </>
        )}
      </Celula>
      <Celula
        indice={4}
        rotulo={
          <>
            <Icone nome="package" className="text-fg-faint" />
            Entregas em {entregas.nomeMes}
          </>
        }
      >
        {entregas.atual}
        <Apoio>{textoEntregasAnteriores(entregas.anterior, entregas.nomeMesAnterior)}</Apoio>
      </Celula>
    </section>
  );
}
