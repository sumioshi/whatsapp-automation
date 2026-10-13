import { NextResponse } from "next/server";
import { iaDaCaixa } from "@/lib/caixa-dados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/caixa/ia: entregas vivas da fila de envio e perguntas esperando o OK (seção "Com a IA" da fila). */
export async function GET() {
  return NextResponse.json(await iaDaCaixa());
}
