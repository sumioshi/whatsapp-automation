"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mensagemDe, pedirJson, useCarregar } from "@/app/components/pedirJson";
import { Aviso, Button, CabecalhoPagina, CorpoPagina, Grade12, Icone } from "@/app/components/ui";
import { ContaCard } from "./ContaCard";
import { ContasCard } from "./ContasCard";
import { NovaContaCard } from "./NovaContaCard";
import type { Comando, DadosEquipe, RodarComando } from "./tipos";

type Retorno = { tom: "ok" | "erro"; texto: string } | { tom: "senha"; login: string; senha: string };

/**
 * Equipe: contas de quem atende pelo painel. À esquerda a lista; à direita a conta escolhida
 * (dados, senha, ativar, apagar e conversas liberadas) ou o formulário de conta nova.
 */
export function EquipeView() {
  const { dados, erro, recarregar } = useCarregar<DadosEquipe>("/api/equipe");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [retorno, setRetorno] = useState<Retorno | null>(null);
  /** Marcações de conversas ainda não salvas, por conta: trocar de conta não perde o que foi marcado. */
  const [rascunhos, setRascunhos] = useState<Record<string, string[]>>({});
  const detalheRef = useRef<HTMLDivElement>(null);

  const usuarios = dados?.usuarios ?? [];
  const conta = usuarios.find((u) => u.login === selecionado) ?? null;

  // Sem escolha (ou a conta escolhida sumiu), cai na primeira; sem conta nenhuma, abre o formulário.
  useEffect(() => {
    if (!dados) return;
    if (dados.usuarios.length === 0) {
      setSelecionado(null);
      setCriando(true);
    } else if (!criando && !dados.usuarios.some((u) => u.login === selecionado)) {
      setSelecionado(dados.usuarios[0].login);
    }
  }, [dados, selecionado, criando]);

  const rodar: RodarComando = useCallback(
    async (c: Comando) => {
      setRetorno((r) => (r?.tom === "senha" ? r : null));
      try {
        const r = await pedirJson<{ senhaGerada?: string }>("/api/equipe", { corpo: c });
        await recarregar();
        return r;
      } catch (e) {
        setRetorno({ tom: "erro", texto: mensagemDe(e) });
        return null;
      }
    },
    [recarregar],
  );

  function mostrarDetalhe() {
    if (window.matchMedia("(max-width: 1020px)").matches) {
      requestAnimationFrame(() => detalheRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function escolher(login: string) {
    setCriando(false);
    setSelecionado(login);
    mostrarDetalhe();
  }

  function abrirCriacao() {
    setCriando(true);
    mostrarDetalhe();
  }

  const ativas = usuarios.filter((u) => u.ativo).length;
  const subtitulo = dados
    ? usuarios.length === 0
      ? "Nenhuma conta ainda"
      : `${usuarios.length} ${usuarios.length === 1 ? "conta" : "contas"} · ${ativas} ${ativas === 1 ? "ativa" : "ativas"}`
    : "Quem atende pelo seu WhatsApp";

  return (
    <>
      <CabecalhoPagina
        variante="barra"
        titulo="Equipe"
        subtitulo={<span className="max-[860px]:hidden">{subtitulo}</span>}
        acoes={
          dados && usuarios.length > 0 ? (
            <Button size="sm" onClick={abrirCriacao}>
              <Icone nome="plus" tamanho={14} />
              Nova conta
            </Button>
          ) : undefined
        }
      />
      <CorpoPagina>
        {retorno?.tom === "senha" && <SenhaGerada login={retorno.login} senha={retorno.senha} aoFechar={() => setRetorno(null)} />}
        {retorno && retorno.tom !== "senha" && (
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
            Não deu para carregar a equipe. {erro}
          </Aviso>
        ) : (
          <Grade12 className="items-start">
            <ContasCard
              usuarios={dados ? usuarios : null}
              selecionado={criando ? null : selecionado}
              comRascunho={Object.keys(rascunhos)}
              aoEscolher={escolher}
              aoCriar={abrirCriacao}
            />
            <div ref={detalheRef} className="col-span-8 min-w-0 scroll-mt-6 max-[1020px]:col-span-full">
              {criando || !conta ? (
                <NovaContaCard
                  carregando={!dados}
                  podeCancelar={usuarios.length > 0}
                  rodar={rodar}
                  aoCancelar={() => setCriando(false)}
                  aoCriar={(login, senhaGerada) => {
                    setCriando(false);
                    setSelecionado(login);
                    setRetorno(senhaGerada ? { tom: "senha", login, senha: senhaGerada } : { tom: "ok", texto: `Conta de ${login} criada.` });
                  }}
                />
              ) : (
                <ContaCard
                  key={conta.login}
                  conta={conta}
                  chats={dados?.chats ?? []}
                  rascunho={rascunhos[conta.login] ?? null}
                  aoMudarRascunho={(lista) =>
                    setRascunhos((r) => {
                      const prox = { ...r };
                      if (lista === null) delete prox[conta.login];
                      else prox[conta.login] = lista;
                      return prox;
                    })
                  }
                  rodar={rodar}
                  aoSenhaNova={(senha) => setRetorno({ tom: "senha", login: conta.login, senha })}
                  aoAviso={(texto) => setRetorno({ tom: "ok", texto })}
                />
              )}
            </div>
          </Grade12>
        )}
      </CorpoPagina>
    </>
  );
}

/** Senha que acabou de ser gerada: só aparece aqui, uma vez, com o botão de copiar. */
function SenhaGerada({ login, senha, aoFechar }: { login: string; senha: string; aoFechar: () => void }) {
  const [copiada, setCopiada] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(senha);
      setCopiada(true);
    } catch {
      setCopiada(false);
    }
  }
  return (
    <Aviso
      tom="info"
      aoFechar={aoFechar}
      acoes={
        <Button size="sm" variant="subtle" onClick={() => void copiar()}>
          <Icone nome={copiada ? "check" : "copy"} tamanho={14} />
          {copiada ? "Copiada" : "Copiar senha"}
        </Button>
      }
    >
      Senha de <b className="font-semibold">{login}</b>:{" "}
      <code className="rounded-tag bg-surface px-1.5 py-0.5 font-mono text-[13px] text-fg select-all">{senha}</code>. Anote agora: ela não
      aparece de novo.
    </Aviso>
  );
}
