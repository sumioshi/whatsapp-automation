import { CabecalhoPagina, Card, CorpoPagina, Grade12, Segmentado, Icone } from "@/app/components/ui";
import { montarDashboardAtual } from "@/lib/dashboard-atual";
import { listGroups } from "@/lib/data";
import { sinaisDoDia } from "@/lib/hoje";
import { buildInbox } from "@/lib/inbox";
import { PERIODOS, periodoDe, rodapesDosIndicadores } from "@/lib/painel";
import { painelAtual } from "@/lib/painel-atual";
import {
  Barrinhas,
  EscalaCalor,
  FaixasResposta,
  Indicador,
  MaisAtivos,
  MapaCalor,
  QuemRespondeuRosca,
  TempoGrande,
} from "./Blocos";
import { DashboardView } from "./DashboardView";
import { GraficoColunas, GraficoLinha } from "./Graficos";

export const dynamic = "force-dynamic";

const numero = new Intl.NumberFormat("pt-BR");
const umaCasa = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
/** Barrinhas dos indicadores: as duas últimas semanas. */
const BARRINHAS = 14;

/** Como o atendimento anda: volume, velocidade, quem responde e o que foi entregue; e os contratos. */
export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const periodo = periodoDe((await searchParams).periodo);
  const [p, dados, inbox, grupos] = await Promise.all([painelAtual(periodo), montarDashboardAtual(), buildInbox(), listGroups()]);
  const rodapes = rodapesDosIndicadores(p);
  const sinais = sinaisDoDia(dados.linhas, inbox, Date.now());
  const fotos = Object.fromEntries(grupos.map((g) => [g.slug, g.avatarPath]));
  const dias = `${periodo} dias`;

  return (
    <CorpoPagina>
      <CabecalhoPagina
        titulo="Painel"
        subtitulo="Como o atendimento anda: volume, velocidade, quem responde e o que foi entregue."
        acoes={
          <Segmentado
            rotulo="Período"
            valor={String(periodo)}
            opcoes={PERIODOS.map((n) => ({ valor: String(n), rotulo: `${n} dias`, href: `/dashboard?periodo=${n}` }))}
          />
        }
      />
      <Grade12 className="max-[860px]:gap-3.5">
        <Card largura="p" altura="compacta" icone={<Icone nome="chat" />} titulo="Mensagens recebidas" meta={dias}>
          <Indicador
            grande={numero.format(p.recebidas.total)}
            rodape={rodapes.recebidas}
            barras={<Barrinhas valores={p.recebidas.serie.slice(-BARRINHAS)} cor="var(--color-accent)" />}
          />
        </Card>
        <Card largura="p" altura="compacta" icone={<Icone nome="clock" />} titulo="Primeira resposta" meta="mediana">
          <Indicador
            grande={<TempoGrande ms={p.primeiraResposta.medianaMs} />}
            rodape={rodapes.resposta}
            barras={
              <Barrinhas valores={p.primeiraResposta.serieMediana.slice(-BARRINHAS).map((v) => v ?? 0)} cor="var(--color-ok)" />
            }
          />
        </Card>
        <Card largura="p" altura="compacta" icone={<Icone nome="package" />} titulo="Entregas" meta={p.entregas.nomeMes}>
          <Indicador
            grande={numero.format(p.entregas.atual)}
            rodape={rodapes.entregas}
            barras={<Barrinhas valores={p.entregas.meses.map((m) => m.n)} cor="var(--color-accent)" />}
          />
        </Card>

        <Card
          largura="g"
          altura="padrao"
          icone={<Icone nome="activity" />}
          titulo="Volume de mensagens"
          meta="recebidas por dia"
          acoes={
            <span className="flex gap-3.5 text-[12px] text-fg-faint max-[860px]:hidden">
              <span className="inline-flex items-center gap-1.5">
                <i aria-hidden className="inline-block w-3.5 border-t-2 border-accent" />
                últimos {dias}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i aria-hidden className="inline-block w-3.5 border-t-2 border-dashed border-fg-mute" />
                {dias} antes
              </span>
            </span>
          }
        >
          <GraficoLinha atual={p.recebidas.serie} anterior={p.recebidas.serieAnterior} dias={p.dias} periodo={periodo} />
        </Card>
        <Card largura="p" altura="padrao" icone={<Icone nome="clock" />} titulo="Tempo da primeira resposta" meta={dias}>
          <FaixasResposta faixas={p.faixas} total={p.primeiraResposta.total} />
        </Card>

        <Card largura="p" altura="padrao" icone={<Icone nome="users" />} titulo="Quem respondeu" meta={dias}>
          <QuemRespondeuRosca quem={p.quem} />
        </Card>
        <Card largura="p" altura="padrao" icone={<Icone nome="flag" />} titulo="Clientes mais ativos" meta={`mensagens, ${dias}`}>
          <MaisAtivos itens={p.maisAtivos} />
        </Card>
        <Card
          largura="p"
          altura="padrao"
          icone={<Icone nome="package" />}
          titulo="Entregas por mês"
          meta={p.entregas.media !== null ? `média ${umaCasa.format(p.entregas.media)}` : "últimos 12 meses"}
        >
          <GraficoColunas meses={p.entregas.meses} media={p.entregas.media} />
        </Card>

        <Card
          largura="inteiro"
          icone={<Icone nome="grid-heat" />}
          titulo="Quando os clientes escrevem"
          meta={<span className="max-[860px]:hidden">mensagens por hora, últimos {dias}</span>}
          acoes={<EscalaCalor />}
        >
          <MapaCalor calor={p.calor} />
        </Card>

        <DashboardView dados={dados} sinais={sinais} fotos={fotos} />
      </Grade12>
    </CorpoPagina>
  );
}
