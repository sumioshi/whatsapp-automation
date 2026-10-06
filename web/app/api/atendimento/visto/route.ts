import { NextResponse } from "next/server";
import { atendenteDoPedido, exigirChat, respostaDeErro } from "@/lib/equipe/acesso";
import { marcarVisto } from "@/lib/equipe/visto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const a = await atendenteDoPedido(req);
    const { slug = "" } = (await req.json().catch(() => ({}))) as { slug?: string };
    exigirChat(a, slug);
    await marcarVisto(a.usuario.login, slug, new Date().toISOString());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDeErro(e);
  }
}
