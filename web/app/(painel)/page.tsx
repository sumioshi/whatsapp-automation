import { CabecalhoPagina, Grade12 } from "@/app/components/ui";
import { Kbd } from "@/app/components/ui/Kbd";
import { montarHojeAtual } from "@/lib/hoje-atual";
import { Buscar } from "./_hoje/Buscar";
import { CardEsperando, CardLimites, CardSinais } from "./_hoje/Cards";
import { CardAgenda, CardIa } from "./_hoje/CardsVivos";
import { Faixa } from "./_hoje/Faixa";
import { Icone } from "./_hoje/icones";
import { LinkBotao } from "./_hoje/LinkBotao";
import { ProvedorHoje } from "./_hoje/ProvedorHoje";
import { FraseDoDia } from "./_hoje/Vivos";

export const dynamic = "force-dynamic";

/** A porta de entrada: quem espera, o que a IA faz, a agenda e o que pede decisão hoje. */
export default async function HojePage() {
  const d = await montarHojeAtual();
  return (
    <ProvedorHoje agoraMs={d.agoraMs}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-8 max-[1020px]:p-6 max-[860px]:gap-3.5 max-[860px]:p-4">
          <CabecalhoPagina
            titulo={d.data}
            subtitulo={<FraseDoDia esperando={d.esperando.total} />}
            acoes={
              <>
                <Buscar className="max-[860px]:hidden">
                  <Icone nome="buscar" />
                  Buscar
                  <Kbd className="ml-0.5">⌘ K</Kbd>
                </Buscar>
                <LinkBotao href="/inbox" variante="tinta">
                  <Icone nome="caixa" />
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
        </div>
      </div>
    </ProvedorHoje>
  );
}
