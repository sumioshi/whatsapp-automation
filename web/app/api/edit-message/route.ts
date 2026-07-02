import { NextResponse } from "next/server";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

interface Body {
  jid?: string;
  msgId?: string;
  text?: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!body.jid || !body.msgId || !text) {
    return NextResponse.json({ error: "jid, msgId e text são obrigatórios" }, { status: 400 });
  }

  try {
    const res = await fetch(`${CONTROL_URL}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jid: body.jid, msgId: body.msgId, text }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return NextResponse.json({ error: data.error ?? "falha na edição" }, { status: res.status || 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Coletor offline." }, { status: 502 });
  }
}
