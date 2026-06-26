import { NextResponse } from "next/server";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

interface Body {
  jid?: string;
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
  if (!body.jid || !text) {
    return NextResponse.json({ error: "jid e text são obrigatórios" }, { status: 400 });
  }

  try {
    const res = await fetch(`${CONTROL_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jid: body.jid, text }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return NextResponse.json(
        { error: data.error ?? "falha no envio" },
        { status: res.status || 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Coletor offline — inicie o coletor para enviar." },
      { status: 502 },
    );
  }
}
