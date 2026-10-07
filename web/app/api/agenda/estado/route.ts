import { NextResponse } from "next/server";
import { estadoAgenda } from "@/lib/google/calendario";
import { respostaDeErroAgenda } from "@/lib/google/resposta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Configurado, conectado, conta e agendas. */
export async function GET() {
  try {
    return NextResponse.json(await estadoAgenda());
  } catch (e) {
    const { status, corpo } = respostaDeErroAgenda(e);
    return NextResponse.json(corpo, { status });
  }
}
