import { NextResponse } from "next/server";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

interface Body {
  jid?: string;
  text?: string;
  humano?: boolean;
  slug?: string;
  typos?: boolean;
  umBalao?: boolean;
  /** Balões explícitos (um item = um balão); `text` vira opcional. */
  baloes?: string[];
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const baloes = Array.isArray(body.baloes)
    ? body.baloes.filter((b): b is string => typeof b === "string" && b.trim() !== "")
    : [];
  const text = body.text?.trim() || baloes.join("\n\n");
  if (!body.jid || !text) {
    return NextResponse.json({ error: "jid e text (ou baloes) são obrigatórios" }, { status: 400 });
  }

  try {
    const res = await fetch(`${CONTROL_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jid: body.jid,
        text,
        humano: body.humano === true,
        slug: body.slug,
        typos: body.typos === true,
        umBalao: body.umBalao === true,
        ...(baloes.length ? { baloes } : {}),
      }),
      // Cliente que desconecta (Esc no agente) derruba esta chamada, e o control
      // server cancela a entrega entre passos.
      signal: req.signal,
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      baloes?: number;
      enviados?: number;
      cancelado?: boolean;
    };
    if (!res.ok || !data.ok) {
      return NextResponse.json(
        { error: data.error ?? "falha no envio" },
        { status: res.status || 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      baloes: data.baloes,
      enviados: data.enviados,
      ...(data.cancelado ? { cancelado: true } : {}),
    });
  } catch (err) {
    if (req.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
      return NextResponse.json({ ok: false, cancelado: true }, { status: 499 });
    }
    return NextResponse.json(
      { error: "Coletor offline — inicie o coletor para enviar." },
      { status: 502 },
    );
  }
}
