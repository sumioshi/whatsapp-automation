import { CabecalhoPagina, CorpoPagina, Grade12, Icone } from "@/app/components/ui";
import { Kbd } from "@/app/components/ui/Kbd";
import { montarHojeAtual } from "@/lib/hoje-atual";
import { Buscar } from "./_hoje/Buscar";
import { CardEsperando, CardLimites, CardSinais } from "./_hoje/Cards";
import { CardAgenda, CardIa } from "./_hoje/CardsVivos";
import { Faixa } from "./_hoje/Faixa";
import { LinkBotao } from "./_hoje/LinkBotao";
import { ProvedorHoje } from "./_hoje/ProvedorHoje";
import { FraseDoDia } from "./_hoje/Vivos";

export const dynamic = "force-dynamic";

/** A porta de entrada: quem espera, o que a IA faz, a agenda e o que pede decisão hoje. */
export default async function HojePage() {
  const d = await montarHojeAtual();
  return (
    <ProvedorHoje agoraMs={d.agoraMs}>
      <CorpoPagina>
        <CabecalhoPagina
          titulo={d.data}
          subtitulo={<FraseDoDia esperando={d.esperando.total} />}
          acoes={
            <>
              <Buscar className="max-[860px]:hidden">
                <Icone nome="search" />
                Buscar
                <Kbd className="ml-0.5">⌘ K</Kbd>
              </Buscar>
              <LinkBotao href="/inbox" variante="tinta">
                <Icone nome="inbox" />
                Abrir caixa
              </LinkBotao>
            </>
          }
        />
        <Faixa d={d} />
        <Grade12 className="max-[860px]:gap-3.5">
          <CardEsperando esperando={d.esperando} />
          <CardAgenda />
          <CardIa ia={d.ia} chats={d.chats} />
          <CardSinais sinais={d.sinais} />
          <CardLimites limites={d.limites} />
        </Grade12>
      </CorpoPagina>
    </ProvedorHoje>
  );
}
