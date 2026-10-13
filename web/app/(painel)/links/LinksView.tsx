"use client";

import { useMemo, useRef, useState } from "react";
import { mensagemDe, pedirJson, useCarregar } from "@/app/components/pedirJson";
import { Aviso, Button, CabecalhoPagina, Card, CorpoPagina, EmptyState, Grade12, Icone } from "@/app/components/ui";
import type { LinksMap } from "@/lib/links";
import { LinkForm } from "./LinkForm";
import { LinkLinha } from "./LinkLinha";
import { type ChatOpcao, type DadosLinks, type Executor, FORM_VAZIO, type FormLink, type ModoAgente } from "./tipos";

async function carregarLinks(): Promise<DadosLinks> {
  const [l, t] = await Promise.all([
    pedirJson<{ links: LinksMap; chats: ChatOpcao[] }>("/api/links"),
    pedirJson<{ agente?: DadosLinks["agente"]; executor?: DadosLinks["executor"] }>("/api/triage"),
  ]);
  return { ...l, agente: t.agente ?? {}, executor: t.executor ?? {} };
}

/** Links de projeto: lista à esquerda (com agente de triagem e executor por conversa) e o formulário à direita. */
export function LinksView() {
  const { dados, erro, recarregar, definir } = useCarregar<DadosLinks>(carregarLinks);
  const [form, setForm] = useState<FormLink>(FORM_VAZIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [retorno, setRetorno] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const primeiroCampo = useRef<HTMLSelectElement>(null);

  const nomeDoChat = useMemo(() => new Map((dados?.chats ?? []).map((c) => [c.slug, c.name])), [dados]);
  const links = Object.entries(dados?.links ?? {});
  const comAgente = links.filter(([slug]) => (dados?.agente[slug] ?? "off") !== "off").length;

  function focarFormulario() {
    requestAnimationFrame(() => {
      const el = primeiroCampo.current;
      if (!el) return;
      if (window.matchMedia("(max-width: 1020px)").matches) el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
    });
  }

  function novo() {
    setForm(FORM_VAZIO);
    setEditando(null);
    setErroForm(null);
    focarFormulario();
  }

  function editar(slug: string) {
    const e = dados?.links[slug];
    if (!e) return;
    setForm({ slug, repoPath: e.repoPath, cliente: e.cliente, tipo: e.tipo, notas: e.notas, github: e.github ?? "" });
    setEditando(slug);
    setErroForm(null);
    focarFormulario();
  }

  async function salvar() {
    if (salvando) return;
    if (!form.slug || !form.repoPath.trim()) {
      setErroForm("Escolha uma conversa e informe o caminho do repositório.");
      return;
    }
    setSalvando(true);
    setErroForm(null);
    try {
      await pedirJson("/api/links", { corpo: form });
      await recarregar();
      setRetorno({ tom: "ok", texto: `Link de ${nomeDoChat.get(form.slug) ?? form.slug} salvo.` });
      setForm(FORM_VAZIO);
      setEditando(null);
    } catch (e) {
      setErroForm(mensagemDe(e));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(slug: string) {
    setRetorno(null);
    try {
      await pedirJson(`/api/links?slug=${encodeURIComponent(slug)}`, { metodo: "DELETE" });
      if (editando === slug) novo();
      await recarregar();
      setRetorno({ tom: "ok", texto: `Link de ${nomeDoChat.get(slug) ?? slug} excluído.` });
    } catch (e) {
      setRetorno({ tom: "erro", texto: `Não deu para excluir: ${mensagemDe(e)}` });
    }
  }

  async function definirTriagem(slug: string, action: "agente" | "executor", value: ModoAgente | Executor) {
    setRetorno(null);
    // Otimista: o seletor muda na hora; a recarga confirma (ou desfaz, se falhar).
    definir((d) => (d ? { ...d, [action]: { ...d[action], [slug]: value } } : d));
    try {
      await pedirJson("/api/triage", { corpo: { action, slug, value } });
    } catch (e) {
      setRetorno({ tom: "erro", texto: `Não deu para mudar o ${action === "agente" ? "agente" : "executor"}: ${mensagemDe(e)}` });
    }
    await recarregar();
  }

  const subtitulo = dados
    ? links.length === 0
      ? "Nenhum link ainda"
      : `${links.length} ${links.length === 1 ? "link" : "links"} · ${comAgente} com agente de triagem`
    : "Repositórios ligados a conversas";

  return (
    <>
      <CabecalhoPagina
        variante="barra"
        titulo="Links de projeto"
        subtitulo={<span className="max-[860px]:hidden">{subtitulo}</span>}
        acoes={
          <Button size="sm" onClick={novo}>
            <Icone nome="plus" tamanho={14} />
            Novo link
          </Button>
        }
      />
      <CorpoPagina>
        {retorno && (
          <Aviso tom={retorno.tom} aoFechar={() => setRetorno(null)}>
            {retorno.texto}
          </Aviso>
        )}
        {erro ? (
          <Aviso
            tom="erro"
            acoes={
              <Button size="sm" variant="subtle" onClick={() => void recarregar()}>
                Tentar de novo
              </Button>
            }
          >
            Não deu para carregar os links. {erro}
          </Aviso>
        ) : (
          <Grade12 className="items-start">
            <Card
              largura="g"
              titulo="Links"
              icone={<Icone nome="link" />}
              meta={links.length > 0 ? <span className="font-mono tabular-nums">{links.length}</span> : undefined}
              rodape={
                links.length > 0 ? (
                  <span>
                    Agente de triagem: <b className="font-medium text-fg-dim">Abre issue</b> e espera o seu ok;{" "}
                    <b className="font-medium text-fg-dim">Issue e PR</b> já marca para o executor abrir o PR. Precisa do GitHub.
                  </span>
                ) : undefined
              }
            >
              {!dados ? (
                <p className="py-2 text-[13px] text-fg-faint">Carregando…</p>
              ) : links.length === 0 ? (
                <EmptyState
                  className="py-10"
                  title="Nenhum link ainda"
                  description="Escolha uma conversa e o repositório do cliente no formulário ao lado."
                />
              ) : (
                <ul className="border-t border-line">
                  {links.map(([slug, entrada]) => (
                    <LinkLinha
                      key={slug}
                      nome={nomeDoChat.get(slug) ?? slug}
                      entrada={entrada}
                      agente={dados.agente[slug] ?? "off"}
                      executor={dados.executor[slug] ?? "claude"}
                      aoAgente={(v) => void definirTriagem(slug, "agente", v)}
                      aoExecutor={(v) => void definirTriagem(slug, "executor", v)}
                      aoEditar={() => editar(slug)}
                      aoExcluir={() => excluir(slug)}
                      editando={editando === slug}
                    />
                  ))}
                </ul>
              )}
            </Card>
            <LinkForm
              form={form}
              chats={dados?.chats ?? []}
              editando={editando !== null}
              salvando={salvando}
              erro={erroForm}
              aoMudar={(f) => {
                setForm(f);
                setErroForm(null);
              }}
              aoSalvar={() => void salvar()}
              aoLimpar={novo}
              primeiroCampo={primeiroCampo}
            />
          </Grade12>
        )}
      </CorpoPagina>
    </>
  );
}
