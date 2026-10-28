import { NextResponse } from "next/server";
import { caixaDeEntrada } from "@/lib/caixa-de-entrada";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/caixa/entrada: quem espera resposta e de qual projeto. Só lê.
 * `todos=1` inclui os chats que se mexeram desde `desde` (ISO, default 24 h);
 * `grupos=a,b` restringe.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const desde = q.get("desde") ?? undefined;
  if (desde && Number.isNaN(Date.parse(desde))) {
    return NextResponse.json({ erro: "desde precisa ser uma data ISO" }, { status: 400 });
  }
  const grupos = (q.get("grupos") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return NextResponse.json(
    await caixaDeEntrada({
      todos: q.get("todos") === "1",
      ...(desde ? { desde: new Date(desde).toISOString() } : {}),
      ...(grupos.length ? { grupos } : {}),
    }),
  );
}
