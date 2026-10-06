import { NextResponse } from "next/server";
import { listGroups } from "@/lib/data";
import { atendenteDoPedido, respostaDeErro } from "@/lib/equipe/acesso";
import { lerVisto } from "@/lib/equipe/visto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const a = await atendenteDoPedido(req);
    const grupos = await listGroups({ lastSeen: await lerVisto(a.usuario.login) });
    return NextResponse.json(grupos.filter((g) => a.chats.has(g.slug)));
  } catch (e) {
    return respostaDeErro(e);
  }
}
