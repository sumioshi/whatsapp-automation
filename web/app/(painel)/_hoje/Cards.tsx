"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnelEspera, Avatar, Badge, Card, cn, Contador, Etiqueta, IconButton, MedidorUso, Icone } from "@/app/components/ui";
import { tipoPeloSlug } from "@/lib/aparencia";
import type { DadosHoje } from "@/lib/hoje-atual";
import type { TomSinal } from "@/lib/hoje";
import { rotasPainel } from "@/lib/rotas-painel";
import { LinkRodape } from "./LinkBotao";
import { FOCO, Linha, Texto, Vazio } from "./pecas";

const rotas = rotasPainel("dono");
const foto = (avatarPath: string | null) => (avatarPath ? rotas.midia(avatarPath) : null);

/** Quem está esperando resposta, o mais antigo primeiro (a mesma régua da Caixa). */
export function CardEsperando({ esperando }: { esperando: DadosHoje["esperando"] }) {
  return (
    <Card
      largura="g"
      altura="padrao"
      icone={<Icone nome="inbox" />}
      titulo="Esperando você"
      meta="mais antigo primeiro"
      rodape={
        <>
          <span className="font-mono tabular-nums">
            {esperando.total} no total · {esperando.acimaDe4h} há mais de 4 h
            {esperando.paradas > 0 && ` · ${esperando.paradas} parados há mais de 7 dias`}
          </span>
          <LinkRodape href="/inbox">Ver na caixa</LinkRodape>
        </>
      }
    >
      {esperando.linhas.length === 0 ? (
        <Vazio titulo="Ninguém esperando resposta">
          Quando um cliente escrever e ficar sem resposta, ele aparece aqui, o mais antigo primeiro.
        </Vazio>
      ) : (
        esperando.linhas.map((l) => (
          <Linha key={l.slug} href={rotas.chat(l.slug)}>
            <Avatar nome={l.nome} tipo={tipoPeloSlug(l.slug)} fotoUrl={foto(l.avatarPath)} tamanho="sm" />
            <Texto
              titulo={
                <>
                  <span className="truncate">{l.nome}</span>
                  {l.mencao ? (
                    <Badge variant="accent" className="h-5 px-1.5 text-[11.5px]">
                      menção
                    </Badge>
                  ) : (
                    l.etiqueta && <Etiqueta nome={l.etiqueta} tamanho="sm" />
                  )}
                </>
              }
              apoio={l.previa ? `${l.quem}: ${l.previa}` : l.quem}
            />
            <span className="flex shrink-0 flex-col items-end gap-1.5">
              <AnelEspera ms={l.waitingMs} />
              <Contador n={l.naoLidas} destaque={l.mencao} />
            </span>
          </Linha>
        ))
      )}
    </Card>
  );
}

const VARIANTE_TOM: Record<TomSinal, "danger" | "warn" | "neutral"> = { perigo: "danger", atencao: "warn", neutro: "neutral" };

async function postarTriagem(action: "resolved" | "muted" | "ignorarSinal", slug: string, value: string | boolean) {
  await fetch("/api/triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, slug, value }),
  });
}

/** Contrato, prazo e silêncio: o que pede uma decisão hoje. */
export function CardSinais({ sinais }: { sinais: DadosHoje["sinais"] }) {
  const [itens, setItens] = useState(sinais.itens);
  const [removidos, setRemovidos] = useState(0);

  useEffect(() => {
    setItens(sinais.itens);
    setRemovidos(0);
  }, [sinais.itens]);

  async function ignorarSinal(s: DadosHoje["sinais"]["itens"][number]) {
    setItens((prev) => prev.filter((item) => item.chave !== s.chave));
    setRemovidos((n) => n + 1);
    try {
      if (s.chave.endsWith("|espera")) {
        await postarTriagem("resolved", s.slug, new Date().toISOString());
      }
      await postarTriagem("ignorarSinal", s.chave, true);
    } catch {
      // falha silenciosa na UI otimista
    }
  }

  async function silenciarConversa(slug: string) {
    const qtd = itens.filter((item) => item.slug === slug).length;
    setItens((prev) => prev.filter((item) => item.slug !== slug));
    if (qtd > 0) setRemovidos((n) => n + qtd);
    try {
      await postarTriagem("muted", slug, true);
    } catch {
      // falha silenciosa na UI otimista
    }
  }

  const totalExibido = itens.length === 0 ? 0 : Math.max(itens.length, sinais.total - removidos);

  return (
    <Card
      largura="p"
      altura="padrao"
      icone={<Icone nome="flag" />}
      titulo="Sinais"
      meta={<span className="font-mono tabular-nums">{totalExibido}</span>}
      rodape={
        <>
          <span>contrato, prazo e silêncio</span>
          <LinkRodape href="/dashboard#sinais">Ver no painel</LinkRodape>
        </>
      }
    >
      {itens.length === 0 ? (
        <Vazio titulo="Nada pedindo decisão">Contratos em dia e ninguém sem resposta há mais de 24 h.</Vazio>
      ) : (
        itens.map((s) => (
          <Linha key={s.chave} className="gap-2">
            <Link href={rotas.chat(s.slug)} className={cn("group flex min-w-0 flex-1 items-center gap-3 py-1", FOCO)}>
              <Avatar nome={s.nome} tipo={tipoPeloSlug(s.slug)} fotoUrl={foto(s.avatarPath)} tamanho="sm" />
              <Texto titulo={<span className="truncate">{s.nome}</span>} apoio={s.explicacao} />
              <Badge variant={VARIANTE_TOM[s.tom]}>{s.texto}</Badge>
            </Link>
            <span className="flex shrink-0 items-center gap-0.5">
              <IconButton
                size="sm"
                title="Ignorar este sinal"
                aria-label={`Ignorar sinal de ${s.nome}`}
                onClick={() => void ignorarSinal(s)}
                className="h-7 w-7 text-fg-faint hover:text-fg"
              >
                <Icone nome="x" tamanho={14} />
              </IconButton>
              <IconButton
                size="sm"
                title="Silenciar conversa (ocultar de Sinais e da Caixa)"
                aria-label={`Silenciar conversa ${s.nome}`}
                onClick={() => void silenciarConversa(s.slug)}
                className="h-7 w-7 text-fg-faint hover:text-fg"
              >
                <Icone nome="mute" tamanho={14} />
              </IconButton>
            </span>
          </Linha>
        ))
      )}
    </Card>
  );
}

/** Uso dos contratos com limite de mensagens: o âmbar é o que passou do plano. */
export function CardLimites({ limites }: { limites: DadosHoje["limites"] }) {
  return (
    <Card
      largura="p"
      altura="padrao"
      icone={<Icone nome="gauge" />}
      titulo="Contratos no limite"
      meta="mensagens, 30 dias"
      rodape={
        <>
          <span>a marca é o limite do plano</span>
          <LinkRodape href="/clientes">Ver clientes</LinkRodape>
        </>
      }
    >
      {limites.itens.length === 0 ? (
        <Vazio titulo="Nenhum contrato com limite">
          Defina o limite de mensagens no contrato do cliente para acompanhar aqui quem está perto ou acima do plano.
        </Vazio>
      ) : (
        <div className="space-y-4 pt-0.5">
          {limites.itens.map((l) => (
            <Link key={l.slug} href={rotas.chat(l.slug)} className={`group block rounded-[6px] ${FOCO}`}>
              <MedidorUso
                rotulo={<span className="group-hover:text-accent">{l.nome}</span>}
                avatar={<Avatar nome={l.nome} tipo={tipoPeloSlug(l.slug)} fotoUrl={foto(l.avatarPath)} tamanho="xs" />}
                valor={l.valor}
                limite={l.limite}
                rotuloAcessivel={`${l.nome}: ${l.valor} de ${l.limite} mensagens em 30 dias`}
              />
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
