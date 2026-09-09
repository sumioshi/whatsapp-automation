import { NextResponse } from "next/server";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

/**
 * POST /api/cancelar-envio {jid} — interrompe a entrega humanizada em andamento
 * daquele chat (o que já saiu fica). É o caminho manual do "cancela" quando o
 * Esc do agente não derruba a conexão a tempo.
 */
export async function POST(req: Request) {
  let body: { jid?: string };
  try {
    body = (await req.json()) as { jid?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body.jid) return NextResponse.json({ error: "jid é obrigatório" }, { status: 400 });
  try {
    const res = await fetch(`${CONTROL_URL}/cancelar-envio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jid: body.jid }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string; cancelado?: boolean };
    if (!res.ok || !data.ok) {
      return NextResponse.json({ error: data.error ?? "falha ao cancelar" }, { status: res.status || 502 });
    }
    return NextResponse.json({ ok: true, cancelado: data.cancelado === true });
  } catch {
    return NextResponse.json({ error: "Coletor offline." }, { status: 502 });
  }
}
