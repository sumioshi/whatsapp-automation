"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { mensagemDe, pedirJson, useCarregar } from "@/app/components/pedirJson";
import { Avatar, Aviso, CampoBusca, Card, EmptyState, Icone, Segmentado, Toggle } from "@/app/components/ui";
import { casaBusca } from "@/lib/busca";
import { Carregando, FalhaAoCarregar } from "./partes";
import { ANCORA_CARD, type AoResumir } from "./secoes";

interface Contato {
  id: string;
  name: string;
  role: "team" | "client";
}

/** Acima disso a lista pede busca: conta grande tem milhares de contatos. */
const LIMITE = 200;

/** Quem é da equipe nos grupos: separa a resposta de vocês do que o cliente disse nos resumos. */
export function TimeCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados, erro, recarregar, definir } = useCarregar<Contato[]>("/api/team");
  const [busca, setBusca] = useState("");
  const [vista, setVista] = useState<"todos" | "time">("todos");
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const noTime = dados?.filter((c) => c.role === "team").length ?? 0;
  useEffect(() => {
    if (dados) aoResumir("time", { texto: String(noTime) });
  }, [aoResumir, dados, noTime]);

  const filtrados = useMemo(() => {
    return (dados ?? []).filter((c) => (vista === "todos" || c.role === "team") && casaBusca(c.name, busca));
  }, [dados, busca, vista]);
  const mostrados = filtrados.slice(0, LIMITE);

  async function alternar(c: Contato, team: boolean) {
    setErroAcao(null);
    const antes = dados;
    definir((lista) => lista?.map((x) => (x.id === c.id ? { ...x, role: team ? "team" : "client" } : x)) ?? null);
    try {
      definir(await pedirJson<Contato[]>("/api/team", { corpo: { id: c.id, team } }));
    } catch (e) {
      definir(antes);
      setErroAcao(mensagemDe(e));
    }
  }

  return (
    <Card
      id="time"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Meu time"
      icone={<Icone nome="user" />}
      acoes={
        dados && dados.length > 0 ? (
          <Segmentado
            rotulo="Mostrar"
            valor={vista}
            aoMudar={setVista}
            opcoes={[
              { valor: "todos", rotulo: "Todos", num: dados.length },
              { valor: "time", rotulo: "No time", num: noTime },
            ]}
          />
        ) : undefined
      }
      rodape={
        <>
          <span>As contas de acesso ao painel ficam em Equipe.</span>
          <Link href="/equipe" className="focus-ring ml-auto rounded-tag font-medium text-accent hover:underline">
            Abrir Equipe
          </Link>
        </>
      }
    >
      {erro ? (
        <FalhaAoCarregar erro={erro} aoTentar={() => void recarregar()} />
      ) : !dados ? (
        <Carregando linhas={4} rotulo="Carregando as pessoas…" />
      ) : dados.length === 0 ? (
        <EmptyState title="Ninguém ainda" description="Aparece aqui quem mandar mensagem nos grupos." />
      ) : (
        <>
          <p className="max-w-[72ch] text-[13.5px] leading-relaxed text-fg-dim">
            Marque quem é da sua equipe. Os resumos usam isso para separar o que o cliente disse do que vocês responderam.
          </p>
          {erroAcao && (
            <Aviso tom="erro" aoFechar={() => setErroAcao(null)} className="mt-3">
              Não deu para salvar: {erroAcao}
            </Aviso>
          )}
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar pessoa" rotulo="Buscar pessoa pelo nome" className="mt-4 w-full max-w-[320px]" />
          {mostrados.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-fg-faint">
              {vista === "time" && !busca ? "Ninguém marcado ainda." : "Ninguém com esse nome."}
            </p>
          ) : (
            <ul className="mt-3 -mr-2 max-h-[360px] overflow-y-auto border-t border-line pr-2">
              {mostrados.map((c) => (
                <li key={c.id} className="flex items-center gap-3 border-b border-line py-2 last:border-b-0">
                  <Avatar nome={c.name} tipo="dm" tamanho="sm" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{c.name}</span>
                  <Toggle checked={c.role === "team"} onChange={(v) => void alternar(c, v)} aria-label={`${c.name} é do time`} />
                </li>
              ))}
            </ul>
          )}
          {filtrados.length > LIMITE && (
            <p className="mt-2 text-[12.5px] text-fg-faint">
              Mostrando <span className="font-mono tabular-nums">{LIMITE}</span> de{" "}
              <span className="font-mono tabular-nums">{filtrados.length.toLocaleString("pt-BR")}</span>. Busque pelo nome para achar
              quem falta.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
