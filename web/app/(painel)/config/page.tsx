import { CabecalhoPagina } from "@/app/components/ui";
import { ConfigView } from "./ConfigView";

export const dynamic = "force-dynamic";

export default function ConfigPage() {
  return (
    <>
      <CabecalhoPagina
        variante="barra"
        titulo="Configurações"
        subtitulo={<span className="max-[860px]:hidden">Conexão, grupos, avisos e transcrição</span>}
      />
      <ConfigView />
    </>
  );
}
