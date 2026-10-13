import { NextResponse } from "next/server";
import { filaDoDono } from "@/lib/caixa-dados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/caixa/fila: só o que a fila da Caixa mostra, para ela se atualizar sem refazer a página. */
export async function GET() {
  return NextResponse.json(await filaDoDono());
}
