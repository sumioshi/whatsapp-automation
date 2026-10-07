import { NextResponse } from "next/server";
import { readStatus } from "@/lib/config";
import { atendenteDoPedido, respostaDeErro } from "@/lib/equipe/acesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Só o estado da conexão: o QR de pareamento nunca sai pra equipe. */
export async function GET(req: Request) {
  try {
    await atendenteDoPedido();
    const s = await readStatus();
    return NextResponse.json({ connection: s.connection });
  } catch (e) {
    return respostaDeErro(e);
  }
}
