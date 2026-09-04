import { NextResponse } from "next/server";
import { type Contrato, readContratos, setContrato } from "@/lib/contratos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readContratos());
}

interface Corpo {
  slug?: string;
  patch?: Partial<Contrato>;
}

/** Atualiza (merge) o contrato de um chat. Validação e mensagens vêm da lib. */
export async function POST(req: Request) {
  let corpo: Corpo;
  try {
    corpo = (await req.json()) as Corpo;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof corpo.slug !== "string" || !corpo.slug) {
    return NextResponse.json({ error: "slug ausente" }, { status: 400 });
  }
  try {
    const contrato = await setContrato(corpo.slug, corpo.patch ?? {});
    return NextResponse.json({ ok: true, slug: corpo.slug, contrato });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "contrato inválido" }, { status: 400 });
  }
}
