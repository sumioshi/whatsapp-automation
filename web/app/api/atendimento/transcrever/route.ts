import { ehCaminhoDeMidia, slugDoCaminho } from "@/lib/caminho-midia";
import { atendenteDoPedido, ErroHttp, exigirChat, irmaosLiberados, respostaDeErro } from "@/lib/equipe/acesso";
import { POST as transcreverDoDono } from "../../transcribe/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const a = await atendenteDoPedido(req);
    const body = (await req.json().catch(() => ({}))) as { slug?: string; mediaPath?: string };
    const slug = typeof body.slug === "string" ? body.slug : "";
    const mediaPath = typeof body.mediaPath === "string" ? body.mediaPath : "";
    exigirChat(a, slug);
    // A conversa aberta pode mostrar mídia do irmão de DM (telefone × LID): vale se for um deles.
    const slugDaMidia = ehCaminhoDeMidia(mediaPath) ? slugDoCaminho(mediaPath) : null;
    if (!slugDaMidia || !(await irmaosLiberados(a, slug)).includes(slugDaMidia)) throw new ErroHttp(404, "não encontrado");
    return transcreverDoDono(
      new Request(req.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: slugDaMidia, mediaPath }) }),
    );
  } catch (e) {
    return respostaDeErro(e);
  }
}
