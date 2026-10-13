"use client";

import { Avatar, Badge, BotaoConfirmar, Button, Icone, Select } from "@/app/components/ui";
import { type Executor, type LinkEntry, type ModoAgente, ROTULO_TIPO } from "./tipos";

/** Um link: conversa, repositório e GitHub; agente de triagem e executor; editar e excluir. */
export function LinkLinha({
  nome,
  entrada,
  agente,
  executor,
  aoAgente,
  aoExecutor,
  aoEditar,
  aoExcluir,
  editando,
}: {
  nome: string;
  entrada: LinkEntry;
  agente: ModoAgente;
  executor: Executor;
  aoAgente: (v: ModoAgente) => void;
  aoExecutor: (v: Executor) => void;
  aoEditar: () => void;
  aoExcluir: () => Promise<void>;
  /** Este link está aberto no formulário. */
  editando: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-line py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 basis-[280px] items-center gap-3">
        <Avatar nome={nome} tipo={entrada.tipo === "dm" ? "dm" : "grupo"} tamanho="md" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13.5px] font-medium text-fg">{nome}</span>
            <Badge variant={entrada.tipo === "dm" ? "info" : "neutral"}>{ROTULO_TIPO[entrada.tipo]}</Badge>
            {editando && <Badge variant="accent">editando</Badge>}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-faint">
            <span className="flex min-w-0 items-center gap-1.5" title={entrada.repoPath}>
              <Icone nome="folder" tamanho={13} />
              <span className="truncate font-mono">{entrada.repoPath}</span>
            </span>
            {entrada.github && (
              <span className="flex min-w-0 items-center gap-1.5">
                <Icone nome="branch" tamanho={13} />
                <span className="truncate font-mono">{entrada.github}</span>
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 min-[861px]:shrink-0 max-[860px]:w-full max-[860px]:pl-12">
        <Select
          tamanho="sm"
          aria-label={`Agente de triagem de ${nome}`}
          value={agente}
          onChange={(e) => aoAgente(e.target.value as ModoAgente)}
          disabled={!entrada.github}
          title={entrada.github ? undefined : "Informe o repositório no GitHub para ligar o agente."}
        >
          <option value="off">Sem agente</option>
          <option value="issue">Abre issue</option>
          <option value="pr">Issue e PR</option>
        </Select>
        <Select tamanho="sm" aria-label={`Executor de ${nome}`} value={executor} onChange={(e) => aoExecutor(e.target.value as Executor)}>
          <option value="claude">Claude</option>
          <option value="copilot">Copilot</option>
        </Select>
        <Button variant="ghost" size="sm" onClick={aoEditar}>
          Editar
        </Button>
        <BotaoConfirmar variante="ghost" pergunta="Excluir este link?" confirmar="Excluir" aoConfirmar={aoExcluir}>
          Excluir…
        </BotaoConfirmar>
      </div>
    </li>
  );
}
