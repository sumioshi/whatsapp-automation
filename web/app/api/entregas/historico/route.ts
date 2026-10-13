import { NextResponse } from "next/server";
import { eventosDaConversa } from "@/lib/caixa-dados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE = /^[A-Za-z0-9._-]+$/;

/**
 * GET /api/entregas/historico?slug=&desde=: transições das entregas da IA numa
 * conversa, para a linha do tempo numerar os balões e avisar o que não saiu.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  if (!SAFE.test(slug)) return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  const desde = url.searchParams.get("desde") ?? "";
  return NextResponse.json({ eventos: await eventosDaConversa(slug, desde) });
}
