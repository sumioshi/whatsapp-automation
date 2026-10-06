import { NextResponse } from "next/server";
import { readGroupMessages } from "@/lib/data";
import { atendenteDoPedido, exigirChat, respostaDeErro } from "@/lib/equipe/acesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE_PADRAO = 150;
const LIMITE_MAX = 500;

export async function GET(req: Request) {
  try {
    const a = await atendenteDoPedido(req);
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug") ?? "";
    exigirChat(a, slug);
    const before = url.searchParams.get("before") ?? undefined;
    if (before && !/^[\w=+/-]{1,128}$/.test(before)) {
      return NextResponse.json({ error: "before inválido" }, { status: 400 });
    }
    const pedido = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, LIMITE_MAX) : LIMITE_PADRAO;
    return NextResponse.json(await readGroupMessages(slug, { limit, before }));
  } catch (e) {
    return respostaDeErro(e);
  }
}
