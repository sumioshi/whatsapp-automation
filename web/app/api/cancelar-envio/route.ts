import { NextResponse } from "next/server";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

/**
 * POST /api/cancelar-envio {jid | ticket} — cancela a entrega humanizada
 * agendada ou em andamento (o que já saiu fica). É o caminho manual do
 * "cancela" e o que o MCP usa por ticket.
 */
export async function POST(req: Request) {
  let body: { jid?: string; ticket?: string };
  try {
    body = (await req.json()) as { jid?: string; ticket?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body.jid && !body.ticket) {
    return NextResponse.json({ error: "jid ou ticket é obrigatório" }, { status: 400 });
  }
  try {
    const res = await fetch(`${CONTROL_URL}/cancelar-envio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jid: body.jid, ticket: body.ticket }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      cancelado?: boolean;
      ticket?: string;
      enviados?: number;
    };
    if (!res.ok || !data.ok) {
      return NextResponse.json({ error: data.error ?? "falha ao cancelar" }, { status: res.status || 502 });
    }
    return NextResponse.json({
      ok: true,
      cancelado: data.cancelado === true,
      ...(data.ticket ? { ticket: data.ticket } : {}),
      ...(typeof data.enviados === "number" ? { enviados: data.enviados } : {}),
    });
  } catch {
    return NextResponse.json({ error: "Coletor offline." }, { status: 502 });
  }
}
