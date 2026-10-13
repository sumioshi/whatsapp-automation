"use client";

import { Avatar, Card, cn, Icone } from "@/app/components/ui";
import { hhmm, minutosBrt } from "@/lib/agenda-semana";
import { tipoPeloSlug } from "@/lib/aparencia";
import type { DadosHoje } from "@/lib/hoje-atual";
import { agendaDoDia, ordenarTickets } from "@/lib/hoje";
import { rotasPainel } from "@/lib/rotas-painel";
import { LinkBotao, LinkRodape } from "./LinkBotao";
import { Linha, Texto, Vazio } from "./pecas";
import { useHoje } from "./ProvedorHoje";

const rotas = rotasPainel("dono");
/** Linhas da agenda que cabem no card, debaixo da faixa do dia. */
const ITENS_AGENDA = 4;
const TICKETS_VISIVEIS = 3;

function hora(ms: number): string {
  return hhmm(minutosBrt(ms));
}

/** O dia das 8 às 20 h com os compromissos e o agora, e a lista do dia. */
export function CardAgenda() {
  const { agoraMs, agenda } = useHoje();
  const dia = agenda.tipo === "ok" ? agendaDoDia(agenda.eventos, agoraMs, ITENS_AGENDA) : null;
  return (
    <Card
      largura="p"
      altura="padrao"
      icone={<Icone nome="cal" />}
      titulo="Agenda de hoje"
      meta={<span className="font-mono tabular-nums">agora {hora(agoraMs)}</span>}
      rodape={
        <>
          <span>
            Google Agenda
            {dia && dia.restantes > 0 && <span className="font-mono tabular-nums"> · mais {dia.restantes}</span>}
          </span>
          <LinkRodape href="/agenda">Abrir agenda</LinkRodape>
        </>
      }
    >
      {agenda.tipo === "carregando" && <Vazio titulo="Lendo a agenda…" />}
      {agenda.tipo === "nao-configurada" && (
        <Vazio titulo="Agenda não configurada">Faltam as credenciais do Google no servidor para ligar a agenda.</Vazio>
      )}
      {agenda.tipo === "desconectada" && (
        <Vazio titulo="Google Agenda desconectado">
          <p className="mb-3">Conecte a sua conta para ver aqui os compromissos de hoje.</p>
          <LinkBotao href="/agenda" tamanho="sm">
            Conectar agenda
          </LinkBotao>
        </Vazio>
      )}
      {agenda.tipo === "erro" && <Vazio titulo="Agenda fora do ar">{agenda.mensagem}</Vazio>}
      {dia && (
        <>
          <div
            role="img"
            aria-label={`Dia das ${dia.inicioH} às ${dia.fimH} horas com ${dia.blocos.length} ${dia.blocos.length === 1 ? "compromisso" : "compromissos"}; agora são ${hora(agoraMs)}`}
            className="relative mb-2.5 mt-0.5 h-[30px] rounded-[6px] bg-surface-2 shadow-[inset_0_0_0_1px_var(--color-line)]"
          >
            {dia.blocos.map((b) => (
              <span
                key={b.chave}
                className="absolute inset-y-[5px] rounded-[3px]"
                style={{
                  left: `${b.esquerda}%`,
                  width: `${b.largura}%`,
                  background: `color-mix(in srgb, ${b.cor} ${b.passado ? 22 : 55}%, var(--color-surface))`,
                }}
              />
            ))}
            {dia.agora !== null && (
              <span className="absolute -inset-y-[3px] -ml-px w-0.5 rounded-[1px] bg-danger" style={{ left: `${dia.agora}%` }} />
            )}
          </div>
          <div aria-hidden className="-mt-1 flex justify-between font-mono text-[10.5px] leading-none text-fg-faint">
            {dia.marcas.map((h) => (
              <span key={h}>{String(h).padStart(2, "0")}</span>
            ))}
          </div>
          {dia.itens.length === 0 ? (
            <p className="pt-10 text-center text-[12.5px] text-fg-faint">Nenhum compromisso hoje.</p>
          ) : (
            dia.itens.map((i) => {
              const destaque = i.estado === "agora" || i.estado === "proximo";
              return (
                <Linha key={i.chave} className={i.estado === "passado" ? "opacity-50" : undefined}>
                  <span
                    className={cn(
                      "w-11 shrink-0 leading-none",
                      i.quando === "dia todo" ? "text-[11px]" : "font-mono text-[12.5px] font-medium tabular-nums",
                      destaque ? "text-accent" : "text-fg-dim",
                    )}
                  >
                    {i.quando}
                  </span>
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: i.cor }} />
                  <Texto titulo={<span className="truncate">{i.titulo}</span>} apoio={i.detalhe} destaque={destaque} />
                </Linha>
              );
            })
          )}
        </>
      )}
    </Card>
  );
}

/** Um segmento por balão do ticket: os que saíram, o que está sendo digitado e os que faltam. */
function Baloes({ enviados, total }: { enviados: number; total: number }) {
  return (
    <span role="img" aria-label={`${enviados} de ${total} balões enviados`} className="mt-[7px] flex gap-[3px]">
      {Array.from({ length: total }, (_, k) => (
        <i
          // A posição é a identidade do balão.
          key={k}
          className={cn(
            "h-1 max-w-14 flex-1 rounded-[2px]",
            k < enviados
              ? "bg-id-ia"
              : k === enviados
                ? "bg-[linear-gradient(90deg,var(--color-id-ia)_50%,color-mix(in_srgb,var(--color-id-ia)_30%,var(--color-elevated))_50%)]"
                : "bg-elevated",
          )}
        />
      ))}
    </span>
  );
}

function Par({ n, rotulo, primeiro }: { n: number; rotulo: string; primeiro?: boolean }) {
  return (
    <div className={cn("min-w-0 px-3 py-2.5", !primeiro && "border-l border-line")}>
      <b className="block font-mono text-[18px] font-medium leading-none tracking-[-0.02em] tabular-nums">{n}</b>
      <span className="mt-1.5 block truncate text-[11.5px] text-fg-faint">{rotulo}</span>
    </div>
  );
}

/** O que a IA está entregando agora (fila do coletor) e o que ela fez hoje. */
export function CardIa({ ia, chats }: { ia: DadosHoje["ia"]; chats: DadosHoje["chats"] }) {
  const { fila } = useHoje();
  const tickets = fila.tipo === "ok" ? ordenarTickets(fila.tickets) : [];
  return (
    <Card
      largura="p"
      altura="padrao"
      icone={<Icone nome="spark" />}
      titulo="IA trabalhando"
      meta={fila.tipo === "ok" ? <span className="font-mono tabular-nums">{tickets.length}</span> : undefined}
      rodape={<span>{ia.autonomo > 0 ? "nos outros chats, envio com confirmação" : "envio com confirmação em todos os chats"}</span>}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          {fila.tipo === "carregando" && <Vazio titulo="Lendo a fila de envio…" />}
          {fila.tipo === "indisponivel" && (
            <Vazio titulo="Fila de envio fora do alcance">
              Ela mora no coletor. Quando ele responder, as entregas da IA aparecem aqui.
            </Vazio>
          )}
          {fila.tipo === "ok" && tickets.length === 0 && (
            <Vazio titulo="A IA não está enviando nada agora">
              Quando ela responder um cliente, a entrega aparece aqui no ritmo humano.
            </Vazio>
          )}
          {tickets.slice(0, TICKETS_VISIVEIS).map((t) => {
            const chat = chats[t.slug] ?? { nome: t.slug, avatarPath: null };
            const entregando = t.estado === "entregando";
            return (
              <Linha key={t.ticket}>
                <Avatar
                  nome={chat.nome}
                  tipo={tipoPeloSlug(t.slug)}
                  fotoUrl={chat.avatarPath ? rotas.midia(chat.avatarPath) : null}
                  tamanho="sm"
                />
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-medium text-fg">{chat.nome}</b>
                  <small className="mt-px block truncate text-[12.5px] text-fg-faint">
                    {entregando ? "entregando com ritmo humano" : `começa às ${hora(Date.parse(t.entregarEm))}`}
                  </small>
                  {entregando && <Baloes enviados={t.enviados} total={t.total} />}
                </span>
                {entregando ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium text-id-ia">
                    <Icone nome="spark" />
                    <span className="font-mono tabular-nums">
                      {t.enviados} de {t.total}
                    </span>
                  </span>
                ) : (
                  <LinkBotao href={rotas.chat(t.slug)} tamanho="sm">
                    Abrir
                  </LinkBotao>
                )}
              </Linha>
            );
          })}
        </div>
        <div className="mt-3 grid shrink-0 grid-cols-3 rounded-[8px] bg-surface-2 shadow-[inset_0_0_0_1px_var(--color-line)]">
          <Par primeiro n={ia.enviadasHoje} rotulo="enviadas hoje" />
          <Par n={ia.interrompidasHoje} rotulo="interrompidas" />
          <Par n={ia.autonomo} rotulo="no autônomo" />
        </div>
      </div>
    </Card>
  );
}
