"use client";

import type { Ref } from "react";
import { Button, Card, Field, Icone, Input, Segmentado, Select, Textarea } from "@/app/components/ui";
import { type ChatOpcao, type FormLink, type LinkTipo, ROTULO_TIPO } from "./tipos";

const TIPOS: LinkTipo[] = ["projeto", "grupo", "dm"];

/** Formulário de link (novo ou edição). Escolher a conversa sugere o tipo e, se vazio, o cliente. */
export function LinkForm({
  form,
  chats,
  editando,
  salvando,
  erro,
  aoMudar,
  aoSalvar,
  aoLimpar,
  primeiroCampo,
}: {
  form: FormLink;
  chats: ChatOpcao[];
  editando: boolean;
  salvando: boolean;
  erro: string | null;
  aoMudar: (f: FormLink) => void;
  aoSalvar: () => void;
  aoLimpar: () => void;
  primeiroCampo: Ref<HTMLSelectElement>;
}) {
  const pronto = Boolean(form.slug && form.repoPath.trim());

  function escolherConversa(slug: string) {
    const chat = chats.find((c) => c.slug === slug);
    aoMudar({ ...form, slug, tipo: chat ? chat.tipo : form.tipo, cliente: form.cliente || (chat?.name ?? "") });
  }

  return (
    <form
      className="col-span-4 min-w-0 max-[1020px]:col-span-full min-[1021px]:sticky min-[1021px]:top-8"
      onSubmit={(e) => {
        e.preventDefault();
        aoSalvar();
      }}
      aria-labelledby="form-link-titulo"
    >
      <Card
        id="form-link"
        titulo={editando ? "Editar link" : "Novo link"}
        icone={<Icone nome="link" />}
        rodape={
          <>
            {(form.slug || form.repoPath || form.github || form.cliente || form.notas) && (
              <Button variant="ghost" size="sm" className="-ml-2.5" onClick={aoLimpar}>
                {editando ? "Cancelar" : "Limpar"}
              </Button>
            )}
            <Button type="submit" size="sm" className="ml-auto" variant={pronto ? "primary" : "subtle"} disabled={!pronto} loading={salvando}>
              Salvar link
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-fg-faint">
          Liga um repositório a um grupo ou DM. Grava o índice aqui e, no repositório, o{" "}
          <code className="font-mono text-[12px] text-fg-dim">.claude/whatsapp.json</code> e uma linha no{" "}
          <code className="font-mono text-[12px] text-fg-dim">CLAUDE.md</code>, para o Claude já saber o link ao abrir o projeto.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Conversa" htmlFor="link-conversa">
            <Select id="link-conversa" ref={primeiroCampo} value={form.slug} onChange={(e) => escolherConversa(e.target.value)}>
              <option value="">Escolha um grupo ou DM…</option>
              {chats.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                  {c.tipo === "dm" ? " · DM" : ""} ({c.messageCount})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Caminho do repositório" htmlFor="link-repo" hint="Caminho absoluto, como /Users/voce/projetos/cliente-x.">
            <Input
              id="link-repo"
              value={form.repoPath}
              onChange={(e) => aoMudar({ ...form, repoPath: e.target.value })}
              placeholder="/Users/…/cliente-x"
              spellCheck={false}
              className="font-mono"
            />
          </Field>
          <Field label="Repositório no GitHub" htmlFor="link-github" hint="owner/repo, onde o agente de triagem abre as issues.">
            <Input
              id="link-github"
              value={form.github}
              onChange={(e) => aoMudar({ ...form, github: e.target.value })}
              placeholder="org/repo"
              spellCheck={false}
              className="font-mono"
            />
          </Field>
          <Field label="Cliente" htmlFor="link-cliente">
            <Input id="link-cliente" value={form.cliente} onChange={(e) => aoMudar({ ...form, cliente: e.target.value })} placeholder="Nome do cliente" />
          </Field>
          <div>
            <span className="mb-1.5 block text-[12.5px] font-medium text-fg-dim">Tipo</span>
            <Segmentado
              rotulo="Tipo do link"
              valor={form.tipo}
              aoMudar={(tipo) => aoMudar({ ...form, tipo })}
              opcoes={TIPOS.map((t) => ({ valor: t, rotulo: ROTULO_TIPO[t] }))}
            />
          </div>
          <Field label="Notas" htmlFor="link-notas" error={erro ?? undefined}>
            <Textarea id="link-notas" value={form.notas} onChange={(e) => aoMudar({ ...form, notas: e.target.value })} rows={3} placeholder="Contexto curto do projeto…" />
          </Field>
        </div>
      </Card>
    </form>
  );
}
