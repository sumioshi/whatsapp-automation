import { NextResponse } from "next/server";
import { atendenteDoPedido, exigirChat, respostaDeErro } from "@/lib/equipe/acesso";
import { readPresence } from "@/lib/presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const a = await atendenteDoPedido(req);
    const slug = new URL(req.url).searchParams.get("slug") ?? "";
    exigirChat(a, slug);
    return NextResponse.json({ presence: await readPresence(slug) });
  } catch (e) {
    return respostaDeErro(e);
  }
}
