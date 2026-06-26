import { NextResponse } from "next/server";
import { resolveProvider } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado do provedor de IA do copiloto (pra UI: rótulo certo + se está pronto).
 * Não expõe a key — só o rótulo do provedor e os modelos resolvidos.
 */
export async function GET() {
  const p = resolveProvider();
  if (!p) return NextResponse.json({ ready: false });
  return NextResponse.json({
    ready: true,
    label: p.label,
    model: p.modelFor(),
    draftModel: p.modelFor("rascunhar"),
  });
}
