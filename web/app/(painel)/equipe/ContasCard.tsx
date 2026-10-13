"use client";

import { Avatar, Badge, Button, Card, cn, Icone } from "@/app/components/ui";
import type { UsuarioPublico } from "./tipos";

/** Lista das contas da equipe; a escolhida fica marcada como na fila da Caixa. */
export function ContasCard({
  usuarios,
  selecionado,
  comRascunho,
  aoEscolher,
  aoCriar,
}: {
  usuarios: UsuarioPublico[] | null;
  selecionado: string | null;
  /** Contas com conversas marcadas e ainda não salvas. */
  comRascunho: string[];
  aoEscolher: (login: string) => void;
  aoCriar: () => void;
}) {
  return (
    <Card
      largura="p"
      className="min-[1021px]:sticky min-[1021px]:top-8"
      titulo="Contas"
      icone={<Icone nome="users" />}
      meta={usuarios && usuarios.length > 0 ? <span className="font-mono tabular-nums">{usuarios.length}</span> : undefined}
      rodape={
        usuarios && usuarios.length > 0 ? (
          <Button variant="ghost" size="sm" className="-ml-2.5" onClick={aoCriar}>
            <Icone nome="plus" tamanho={14} />
            Nova conta
          </Button>
        ) : undefined
      }
    >
      {!usuarios ? (
        <p className="py-2 text-[13px] text-fg-faint">Carregando…</p>
      ) : usuarios.length === 0 ? (
        <div className="py-3">
          <p className="text-[13.5px] font-medium text-fg">Nenhuma conta ainda</p>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-faint">
            Crie a primeira ao lado. A pessoa entra pelo mesmo link do painel e só vê as conversas que você liberar.
          </p>
        </div>
      ) : (
        <ul className="-mx-2 flex flex-col gap-0.5">
          {usuarios.map((u) => {
            const atual = u.login === selecionado;
            const pendente = comRascunho.includes(u.login);
            return (
              <li key={u.login}>
                <button
                  type="button"
                  aria-current={atual ? "true" : undefined}
                  onClick={() => aoEscolher(u.login)}
                  className={cn(
                    "focus-ring relative flex w-full items-center gap-3 rounded-control px-2 py-2.5 text-left transition-colors",
                    atual ? "bg-selected" : "hover:bg-elevated",
                  )}
                >
                  {atual && <span aria-hidden className="absolute top-2.5 bottom-2.5 left-0 w-0.5 rounded-r-full bg-accent" />}
                  <Avatar nome={u.nome} tipo="dm" tamanho="md" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn("truncate text-[13.5px] font-medium", u.ativo ? "text-fg" : "text-fg-dim")}>{u.nome}</span>
                      {!u.ativo && <Badge>desativada</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-fg-faint">
                      @{u.login} · <span className="font-mono tabular-nums">{u.chats.length}</span>{" "}
                      {u.chats.length === 1 ? "conversa" : "conversas"}
                    </span>
                  </span>
                  {pendente && (
                    <span title="Conversas marcadas e não salvas" className="h-2 w-2 shrink-0 rounded-full bg-warn-mark">
                      <span className="sr-only">Conversas marcadas e não salvas</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
