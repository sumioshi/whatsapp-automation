"use client";

import { useMemo, useState } from "react";
import { haQuanto } from "@/app/components/tempo";
import { Avatar, Badge, BotaoConfirmar, Button, CampoBusca, Card, Etiqueta, Field, Input, Pares, Select } from "@/app/components/ui";
import { casaBusca } from "@/lib/busca";
import { instanteLongo } from "@/lib/formatar-data";
import type { ChatLiberavel, RodarComando, UsuarioPublico } from "./tipos";

function mesmoConjunto(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

/** Uma conta da equipe: dados, nome, senha, ativar/desativar, apagar e as conversas que ela enxerga. */
export function ContaCard({
  conta,
  chats,
  rascunho,
  aoMudarRascunho,
  rodar,
  aoSenhaNova,
  aoAviso,
}: {
  conta: UsuarioPublico;
  chats: ChatLiberavel[];
  /** Conversas marcadas e não salvas; null quando bate com o que está salvo. */
  rascunho: string[] | null;
  aoMudarRascunho: (lista: string[] | null) => void;
  rodar: RodarComando;
  aoSenhaNova: (senha: string) => void;
  aoAviso: (texto: string) => void;
}) {
  const [renomeando, setRenomeando] = useState(false);
  const [nome, setNome] = useState(conta.nome);
  const [ocupado, setOcupado] = useState<"nome" | "ativo" | "chats" | null>(null);
  const marcados = rascunho ?? conta.chats;
  const alterado = rascunho !== null;

  async function comOcupado(qual: "nome" | "ativo" | "chats", fn: () => Promise<void>) {
    setOcupado(qual);
    try {
      await fn();
    } finally {
      setOcupado(null);
    }
  }

  async function salvarNome(e: React.FormEvent) {
    e.preventDefault();
    await comOcupado("nome", async () => {
      if (await rodar({ acao: "editar", login: conta.login, nome: nome.trim() })) setRenomeando(false);
    });
  }

  async function salvarConversas() {
    await comOcupado("chats", async () => {
      if (await rodar({ acao: "chats", login: conta.login, chats: marcados })) {
        aoMudarRascunho(null);
        aoAviso(`Conversas de ${conta.nome} salvas.`);
      }
    });
  }

  return (
    <Card
      id="conta"
      titulo={conta.nome}
      icone={<Avatar nome={conta.nome} tipo="dm" tamanho="xs" />}
      meta={`@${conta.login}`}
      acoes={
        <Badge variant={conta.ativo ? "ok" : "neutral"} dot>
          {conta.ativo ? "Ativa" : "Desativada"}
        </Badge>
      }
      rodape={
        <>
          <span className="min-w-0 truncate">
            {alterado ? (
              "Alterações não salvas"
            ) : (
              <>
                <span className="font-mono tabular-nums">{conta.chats.length}</span>{" "}
                {conta.chats.length === 1 ? "conversa liberada" : "conversas liberadas"}
              </>
            )}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {alterado && (
              <Button variant="ghost" size="sm" onClick={() => aoMudarRascunho(null)}>
                Desfazer
              </Button>
            )}
            <Button size="sm" variant={alterado ? "primary" : "subtle"} disabled={!alterado} loading={ocupado === "chats"} onClick={() => void salvarConversas()}>
              Salvar conversas
            </Button>
          </div>
        </>
      }
    >
      {renomeando ? (
        <form onSubmit={(e) => void salvarNome(e)} className="mb-4 flex flex-wrap items-end gap-2">
          <Field label="Nome" htmlFor="conta-nome" className="min-w-[220px] flex-1">
            <Input
              id="conta-nome"
              // biome-ignore lint/a11y/noAutofocus: o campo só aparece depois do clique em Renomear
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" loading={ocupado === "nome"} disabled={!nome.trim()}>
            Salvar nome
          </Button>
          <Button variant="ghost" onClick={() => setRenomeando(false)}>
            Cancelar
          </Button>
        </form>
      ) : null}

      <Pares
        itens={[
          {
            rotulo: "Último acesso",
            valor: conta.ultimoAcesso ? <span title={instanteLongo(conta.ultimoAcesso)}>{haQuanto(conta.ultimoAcesso)}</span> : "Nunca entrou",
          },
          { rotulo: "Criada em", valor: <span className="font-mono text-[12.5px] tabular-nums">{instanteLongo(conta.criadoEm)}</span> },
          {
            rotulo: "Acesso",
            valor: conta.ativo ? "Entra e responde nas conversas liberadas" : "Bloqueado até você ativar de novo",
          },
        ]}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!renomeando && (
          <Button
            variant="subtle"
            size="sm"
            onClick={() => {
              setNome(conta.nome);
              setRenomeando(true);
            }}
          >
            Renomear
          </Button>
        )}
        <BotaoConfirmar
          variante="subtle"
          perigo={false}
          pergunta="A senha atual deixa de valer e a sessão aberta cai."
          confirmar="Gerar nova senha"
          aoConfirmar={async () => {
            const r = await rodar({ acao: "senha", login: conta.login });
            if (r?.senhaGerada) aoSenhaNova(r.senhaGerada);
          }}
        >
          Nova senha…
        </BotaoConfirmar>
        <Button
          variant="subtle"
          size="sm"
          loading={ocupado === "ativo"}
          title={conta.ativo ? "A sessão aberta cai na hora." : undefined}
          onClick={() => void comOcupado("ativo", async () => void (await rodar({ acao: "ativo", login: conta.login, ativo: !conta.ativo })))}
        >
          {conta.ativo ? "Desativar" : "Ativar"}
        </Button>
        <BotaoConfirmar
          variante="ghost"
          pergunta={`Apagar a conta de ${conta.nome}?`}
          confirmar="Apagar conta"
          aoConfirmar={async () => void (await rodar({ acao: "apagar", login: conta.login }))}
        >
          Apagar…
        </BotaoConfirmar>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <ConversasLiberadas
          chats={chats}
          marcados={marcados}
          aoMudar={(lista) => aoMudarRascunho(mesmoConjunto(lista, conta.chats) ? null : lista)}
        />
      </div>
    </Card>
  );
}

function ConversasLiberadas({
  chats,
  marcados,
  aoMudar,
}: {
  chats: ChatLiberavel[];
  marcados: string[];
  aoMudar: (lista: string[]) => void;
}) {
  const [busca, setBusca] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const etiquetas = useMemo(() => [...new Set(chats.flatMap((c) => c.etiquetas))].sort(), [chats]);
  const visiveis = useMemo(
    () => chats.filter((c) => casaBusca([c.nome, c.slug], busca) && (!etiqueta || c.etiquetas.includes(etiqueta))),
    [chats, busca, etiqueta],
  );
  const conjunto = new Set(marcados);
  // Conta só o que está na lista: slug liberado de conversa que sumiu continua salvo, mas não aparece.
  const total = chats.filter((c) => conjunto.has(c.slug)).length;

  function alternar(slug: string) {
    const prox = new Set(conjunto);
    if (prox.has(slug)) prox.delete(slug);
    else prox.add(slug);
    aoMudar([...prox]);
  }

  function marcarVisiveis(valor: boolean) {
    const prox = new Set(conjunto);
    for (const c of visiveis) {
      if (valor) prox.add(c.slug);
      else prox.delete(c.slug);
    }
    aoMudar([...prox]);
  }

  return (
    <section aria-labelledby="conversas-liberadas">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h4 id="conversas-liberadas" className="text-[13.5px] font-semibold text-fg">
          Conversas liberadas
        </h4>
        <span className="text-[12.5px] text-fg-faint">
          <span className="font-mono tabular-nums">{total}</span> de <span className="font-mono tabular-nums">{chats.length}</span>
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-fg-faint">Só estas aparecem para a pessoa; as outras não existem para ela.</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar conversa" rotulo="Buscar conversa" className="min-w-[200px] flex-1 basis-[220px]" />
        {etiquetas.length > 0 && (
          <div className="w-[180px] shrink-0">
            <Select value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} aria-label="Filtrar por etiqueta">
              <option value="">Todas as etiquetas</option>
              {etiquetas.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => marcarVisiveis(true)} disabled={visiveis.length === 0}>
            Marcar {busca || etiqueta ? "visíveis" : "todas"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => marcarVisiveis(false)} disabled={visiveis.length === 0}>
            Desmarcar {busca || etiqueta ? "visíveis" : "todas"}
          </Button>
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg-faint">Nenhuma conversa com esse filtro.</p>
      ) : (
        <ul className="mt-3 -mr-2 max-h-[420px] overflow-y-auto border-t border-line pr-2">
          {visiveis.map((c) => {
            const marcada = conjunto.has(c.slug);
            return (
              <li key={c.slug} className="border-b border-line last:border-b-0">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={marcada}
                    onChange={() => alternar(c.slug)}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-accent"
                  />
                  <Avatar nome={c.nome} tipo={c.slug.startsWith("dm-") ? "dm" : "grupo"} tamanho="xs" />
                  <span className={marcada ? "min-w-0 flex-1 truncate text-[13.5px] text-fg" : "min-w-0 flex-1 truncate text-[13.5px] text-fg-dim"}>
                    {c.nome}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 max-[860px]:hidden">
                    {c.etiquetas.slice(0, 2).map((t) => (
                      <Etiqueta key={t} nome={t} tamanho="sm" />
                    ))}
                    {c.etiquetas.length > 2 && <span className="font-mono text-[11.5px] text-fg-faint">+{c.etiquetas.length - 2}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
