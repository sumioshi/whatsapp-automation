"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { mensagemDe, pedirJson, useCarregar } from "@/app/components/pedirJson";
import { Avatar, Aviso, BotaoConfirmar, Button, CampoBusca, Card, EmptyState, Icone, Toggle } from "@/app/components/ui";
import { corDoMatiz, matizDaEtiqueta } from "@/lib/aparencia";
import { casaBusca } from "@/lib/busca";
import type { GroupWithTags } from "@/lib/config";
import { Chip } from "./Chip";
import { Carregando, FalhaAoCarregar } from "./partes";
import { ANCORA_CARD, type AoResumir } from "./secoes";

/** Grupos que o coletor captura: busca, filtro por tag, ligar/desligar um a um ou os visíveis de uma vez, e tags. */
export function GruposCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados: grupos, erro, recarregar, definir } = useCarregar<GroupWithTags[]>("/api/groups");
  const [busca, setBusca] = useState("");
  const [tagsAtivas, setTagsAtivas] = useState<string[]>([]);
  const [soMonitorados, setSoMonitorados] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const monitorados = grupos?.filter((g) => g.watch).length ?? 0;
  useEffect(() => {
    if (grupos) aoResumir("grupos", { texto: `${monitorados}/${grupos.length}` });
  }, [aoResumir, grupos, monitorados]);

  const todasTags = useMemo(() => [...new Set((grupos ?? []).flatMap((g) => g.tags))].sort(), [grupos]);

  const filtrados = useMemo(() => {
    return (grupos ?? []).filter((g) => {
      if (soMonitorados && !g.watch) return false;
      if (tagsAtivas.length && !tagsAtivas.some((t) => g.tags.includes(t))) return false;
      return casaBusca([g.name, ...g.tags], busca);
    });
  }, [grupos, busca, tagsAtivas, soMonitorados]);

  async function enviar(corpo: object) {
    setErroAcao(null);
    try {
      definir(await pedirJson<GroupWithTags[]>("/api/groups", { corpo }));
    } catch (e) {
      setErroAcao(mensagemDe(e));
      void recarregar();
    }
  }

  function monitorar(g: GroupWithTags, watch: boolean) {
    // Otimista: a chave muda na hora; a resposta do servidor (ou a recarga, se falhar) confirma.
    definir((lista) => lista?.map((x) => (x.id === g.id ? { ...x, watch } : x)) ?? null);
    void enviar({ id: g.id, watch });
  }

  function limparFiltros() {
    setBusca("");
    setTagsAtivas([]);
    setSoMonitorados(false);
  }

  const total = grupos?.length ?? 0;
  const n = filtrados.length;
  const todos = n === total;
  const filtrando = Boolean(busca.trim() || tagsAtivas.length || soMonitorados);

  return (
    <Card
      id="grupos"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Grupos monitorados"
      icone={<Icone nome="users" />}
      meta={
        grupos && grupos.length > 0 ? (
          <span>
            <span className="font-mono tabular-nums">{monitorados}</span> de <span className="font-mono tabular-nums">{total}</span> monitorados
          </span>
        ) : undefined
      }
      rodape={grupos && grupos.length > 0 ? <span>Monitorar liga a captura das mensagens do grupo. Grupo novo começa desligado.</span> : undefined}
    >
      {erro ? (
        <FalhaAoCarregar erro={erro} aoTentar={() => void recarregar()} />
      ) : !grupos ? (
        <Carregando linhas={4} rotulo="Carregando os grupos…" />
      ) : grupos.length === 0 ? (
        <EmptyState
          title="Nenhum grupo ainda"
          description="Conecte o WhatsApp na seção Conexão. Os grupos aparecem aqui sozinhos."
        />
      ) : (
        <>
          {erroAcao && (
            <Aviso tom="erro" aoFechar={() => setErroAcao(null)} className="mb-3">
              Não deu para salvar: {erroAcao}
            </Aviso>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por nome ou tag" rotulo="Buscar grupos por nome ou tag" className="w-full max-w-[320px]" />
            <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-fg-dim">
              <Toggle size="sm" checked={soMonitorados} onChange={setSoMonitorados} aria-label="Mostrar só os monitorados" />
              Só monitorados
            </label>
            {filtrando && (
              <span className="text-[12.5px] text-fg-faint">
                <span className="font-mono tabular-nums">{n}</span> no filtro
              </span>
            )}
            {n > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button size="sm" variant="subtle" onClick={() => void enviar({ ids: filtrados.map((g) => g.id), watch: true })}>
                  {todos ? "Monitorar todos" : `Monitorar ${n}`}
                </Button>
                <BotaoConfirmar
                  variante="ghost"
                  pergunta={`Parar de monitorar ${n} ${n === 1 ? "grupo" : "grupos"}?`}
                  confirmar="Parar"
                  aoConfirmar={() => enviar({ ids: filtrados.map((g) => g.id), watch: false })}
                >
                  {todos ? "Parar todos" : `Parar ${n}`}
                </BotaoConfirmar>
              </div>
            )}
          </div>

          {todasTags.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {todasTags.map((t) => {
                const ligada = tagsAtivas.includes(t);
                return (
                  <Chip
                    key={t}
                    matiz={t}
                    active={ligada}
                    onClick={() => setTagsAtivas((prev) => (ligada ? prev.filter((x) => x !== t) : [...prev, t]))}
                  >
                    #{t}
                  </Chip>
                );
              })}
            </div>
          )}

          {n === 0 ? (
            <EmptyState
              title="Nenhum grupo com esse filtro"
              description="Mude a busca ou desmarque as tags."
              acao={
                <Button size="sm" variant="subtle" onClick={limparFiltros}>
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <ul className="mt-4 -mr-2 max-h-[480px] overflow-y-auto border-t border-line pr-2">
              {filtrados.map((g) => (
                <GrupoLinha
                  key={g.id}
                  grupo={g}
                  aoMonitorar={(w) => monitorar(g, w)}
                  aoMudarTags={(tags) => void enviar({ id: g.id, tags })}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function GrupoLinha({
  grupo,
  aoMonitorar,
  aoMudarTags,
}: {
  grupo: GroupWithTags;
  aoMonitorar: (watch: boolean) => void;
  aoMudarTags: (tags: string[]) => void;
}) {
  return (
    <li className="flex min-h-12 items-center gap-3 border-b border-line py-2 last:border-b-0">
      <Avatar nome={grupo.name} tipo="grupo" tamanho="sm" />
      {/* Nome e tags na mesma linha; as tags descem quando o nome não deixa espaço. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 max-w-full truncate text-[13.5px] font-medium text-fg">{grupo.name}</span>
        {grupo.tags.map((t) => (
          <TagRemovivel key={t} nome={t} aoRemover={() => aoMudarTags(grupo.tags.filter((x) => x !== t))} />
        ))}
        <AdicionarTag
          grupo={grupo.name}
          aoAdicionar={(t) => {
            if (!grupo.tags.includes(t)) aoMudarTags([...grupo.tags, t]);
          }}
        />
      </div>
      <Toggle checked={grupo.watch} onChange={aoMonitorar} aria-label={`Monitorar ${grupo.name}`} />
    </li>
  );
}

function TagRemovivel({ nome, aoRemover }: { nome: string; aoRemover: () => void }) {
  return (
    <span
      className="etiqueta etiqueta-sm"
      style={{ "--hue": corDoMatiz(matizDaEtiqueta(nome)), paddingRight: 3 } as CSSProperties}
    >
      #{nome}
      <button
        type="button"
        onClick={aoRemover}
        aria-label={`Remover a tag ${nome}`}
        className="focus-ring -ml-1 grid h-4 w-4 place-items-center rounded-full text-fg-faint transition-colors hover:bg-elevated hover:text-danger"
      >
        <Icone nome="x" tamanho={10} />
      </button>
    </span>
  );
}

/** "+ tag" que vira campo: Enter ou sair do campo adiciona, Esc desiste. */
function AdicionarTag({ grupo, aoAdicionar }: { grupo: string; aoAdicionar: (tag: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");

  function concluir(adicionar: boolean) {
    const t = texto.trim().toLowerCase();
    setTexto("");
    setAberto(false);
    if (adicionar && t) aoAdicionar(t);
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={`Adicionar tag em ${grupo}`}
        className="focus-ring inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[11.5px] font-medium text-fg-faint transition-colors hover:bg-elevated hover:text-fg"
      >
        <Icone nome="plus" tamanho={11} />
        tag
      </button>
    );
  }
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: o campo só aparece depois do clique em "+ tag"
      autoFocus
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          concluir(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          concluir(false);
        }
      }}
      onBlur={() => concluir(true)}
      placeholder="nova tag"
      aria-label={`Nova tag em ${grupo}`}
      className="focus-ring h-5 w-28 rounded-full border border-line-2 bg-surface px-2 text-[11.5px] text-fg placeholder:text-fg-faint"
    />
  );
}
