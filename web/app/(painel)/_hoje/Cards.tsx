import Link from "next/link";
import { AnelEspera, Avatar, Badge, Card, Contador, Etiqueta, MedidorUso } from "@/app/components/ui";
import { tipoPeloSlug } from "@/lib/aparencia";
import type { DadosHoje } from "@/lib/hoje-atual";
import type { TomSinal } from "@/lib/hoje";
import { rotasPainel } from "@/lib/rotas-painel";
import { Icone } from "./icones";
import { LinkRodape } from "./LinkBotao";
import { Linha, Texto, Vazio } from "./pecas";

const rotas = rotasPainel("dono");
const foto = (avatarPath: string | null) => (avatarPath ? rotas.midia(avatarPath) : null);

/** Quem está esperando resposta, o mais antigo primeiro (a mesma régua da Caixa). */
export function CardEsperando({ esperando }: { esperando: DadosHoje["esperando"] }) {
  return (
    <Card
      largura="g"
      altura="padrao"
      icone={<Icone nome="caixa" />}
      titulo="Esperando você"
      meta="mais antigo primeiro"
      rodape={
        <>
          <span className="font-mono tabular-nums">
            {esperando.total} no total · {esperando.acimaDe4h} há mais de 4 h
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

/** Contrato, prazo e silêncio: o que pede uma decisão hoje. */
export function CardSinais({ sinais }: { sinais: DadosHoje["sinais"] }) {
  return (
    <Card
      largura="p"
      altura="padrao"
      icone={<Icone nome="bandeira" />}
      titulo="Sinais"
      meta={<span className="font-mono tabular-nums">{sinais.total}</span>}
      rodape={
        <>
          <span>contrato, prazo e silêncio</span>
          <LinkRodape href="/dashboard#sinais">Ver no painel</LinkRodape>
        </>
      }
    >
      {sinais.itens.length === 0 ? (
        <Vazio titulo="Nada pedindo decisão">Contratos em dia e ninguém sem resposta há mais de 24 h.</Vazio>
      ) : (
        sinais.itens.map((s) => (
          <Linha key={s.chave} href={rotas.chat(s.slug)}>
            <Avatar nome={s.nome} tipo={tipoPeloSlug(s.slug)} fotoUrl={foto(s.avatarPath)} tamanho="sm" />
            <Texto titulo={<span className="truncate">{s.nome}</span>} />
            <Badge variant={VARIANTE_TOM[s.tom]}>{s.texto}</Badge>
          </Linha>
        ))
      )}
    </Card>
  );
}

/** Contratos pelo prazo: dias corridos contra a duração; o âmbar é o que passou do fim. */
export function CardLimites({ limites }: { limites: DadosHoje["limites"] }) {
  return (
    <Card
      largura="p"
      altura="padrao"
      icone={<Icone nome="medidor" />}
      titulo="Contratos no limite"
      meta="dias de contrato"
      rodape={
        <>
          <span>a marca é o fim do contrato</span>
          <LinkRodape href="/clientes">Ver clientes</LinkRodape>
        </>
      }
    >
      {limites.itens.length === 0 ? (
        <Vazio titulo="Nenhum contrato com prazo">
          Registre início e fim no contrato do cliente, na conversa dele, para acompanhar a renovação aqui.
        </Vazio>
      ) : (
        <div className="space-y-4 pt-0.5">
          {limites.itens.map((l) => (
            <Link key={l.slug} href={rotas.chat(l.slug)} className="group block rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <MedidorUso
                rotulo={<span className="group-hover:text-accent">{l.nome}</span>}
                avatar={<Avatar nome={l.nome} tipo={tipoPeloSlug(l.slug)} fotoUrl={foto(l.avatarPath)} tamanho="xs" />}
                valor={l.decorridos}
                limite={l.duracao}
                rotuloAcessivel={`${l.nome}: ${l.decorridos} de ${l.duracao} dias de contrato${l.restam < 0 ? `, venceu há ${-l.restam} dias` : `, faltam ${l.restam} dias`}`}
              />
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
