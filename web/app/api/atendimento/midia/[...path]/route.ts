import { atendenteDoPedido, ErroHttp, exigirChat, respostaDeErro } from "@/lib/equipe/acesso";
import { ehCaminhoDeMidia, slugDoCaminho } from "@/lib/caminho-midia";
import { GET as servirMidia } from "../../../media/[...path]/route";

export const runtime = "nodejs";

/** Mesmo streaming (com Range) da rota do dono, depois de conferir chat e caminho. */
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const a = await atendenteDoPedido();
    const { path } = await ctx.params;
    const rel = path.join("/");
    if (!ehCaminhoDeMidia(rel)) throw new ErroHttp(404, "não encontrado");
    exigirChat(a, slugDoCaminho(rel));
    return servirMidia(req, { params: Promise.resolve({ path }) });
  } catch (e) {
    return respostaDeErro(e);
  }
}
