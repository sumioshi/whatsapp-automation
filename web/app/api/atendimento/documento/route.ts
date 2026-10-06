import { ehCaminhoDeMidia, slugDoCaminho } from "@/lib/caminho-midia";
import { atendenteDoPedido, ErroHttp, exigirChat, respostaDeErro } from "@/lib/equipe/acesso";
import { POST as documentoDoDono } from "../../document/route";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const a = await atendenteDoPedido(req);
    const body = (await req.json().catch(() => ({}))) as { slug?: string; mediaPath?: string };
    const slug = typeof body.slug === "string" ? body.slug : "";
    const mediaPath = typeof body.mediaPath === "string" ? body.mediaPath : "";
    exigirChat(a, slug);
    if (!ehCaminhoDeMidia(mediaPath) || slugDoCaminho(mediaPath) !== slug) throw new ErroHttp(404, "não encontrado");
    return documentoDoDono(
      new Request(req.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaPath }) }),
    );
  } catch (e) {
    return respostaDeErro(e);
  }
}
