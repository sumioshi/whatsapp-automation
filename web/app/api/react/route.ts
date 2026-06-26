import { NextResponse } from "next/server";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

interface Body {
  jid?: string;
  msgId?: string;
  participant?: string;
  fromMe?: boolean;
  emoji?: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.jid || !body.msgId || typeof body.emoji !== "string") {
    return NextResponse.json({ error: "jid, msgId e emoji são obrigatórios" }, { status: 400 });
  }

  try {
    const res = await fetch(`${CONTROL_URL}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return NextResponse.json(
        { error: data.error ?? "falha ao reagir" },
        { status: res.status || 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Coletor offline — inicie o coletor para reagir." },
      { status: 502 },
    );
  }
}
