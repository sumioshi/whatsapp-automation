import { NextResponse } from "next/server";
import { atendenteDoPedido, respostaDeErro } from "@/lib/equipe/acesso";
import { filaDaEquipe } from "@/lib/caixa-dados";
import { listaDaPagina, paginaDoAtendente } from "@/lib/equipe/pagina";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/atendimento/fila: a fila de quem atende, só com os chats liberados. */
export async function GET() {
  try {
    await atendenteDoPedido();
    const p = await paginaDoAtendente();
    if (!p) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
    return NextResponse.json(await filaDaEquipe(p.a.chats, p.canonicoDe, (await listaDaPagina()) ?? []));
  } catch (e) {
    return respostaDeErro(e);
  }
}
