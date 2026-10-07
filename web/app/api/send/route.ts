import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { credenciaisDoDono, metaDoPainel, SESSION_COOKIE } from "@/lib/equipe/autenticar";
import { chaveDeSessao } from "@/lib/equipe/sessao";
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
  urgencia?: "agora" | "normal" | "calma";
  citar?: string;
  /** true = segura até a entrega terminar (formato v1); default = 202 com ticket. */
  aguardar?: boolean;
  decorrido_s?: number;
  latenciaMaxima_s?: number;
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

  // Envio direto do dono pelo painel (cookie, sem Basic) sai carimbado: o
  // plantão mostra e a fila do agente se interrompe, como resposta manual.
  const meta =
    body.humano === true
      ? undefined
      : metaDoPainel(
          (await cookies()).get(SESSION_COOKIE)?.value,
          req.headers.get("authorization"),
          credenciaisDoDono(),
          chaveDeSessao(),
        );

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
        ...(body.urgencia ? { urgencia: body.urgencia } : {}),
        ...(body.citar ? { citar: body.citar } : {}),
        ...(body.aguardar === true ? { aguardar: true } : {}),
        ...(typeof body.decorrido_s === "number" ? { decorrido_s: body.decorrido_s } : {}),
        ...(typeof body.latenciaMaxima_s === "number" ? { latenciaMaxima_s: body.latenciaMaxima_s } : {}),
        ...(meta ?? {}),
      }),
      // Cliente que desconecta (Esc no agente) derruba esta chamada, e o control
      // server cancela a entrega entre passos.
      signal: req.signal,
    });
    const data = (await res.json()) as Record<string, unknown> & { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return NextResponse.json(
        { error: data.error ?? "falha no envio" },
        { status: res.status || 502 },
      );
    }
    // 202 = ticket agendado (entrega humanizada assíncrona); 200 = síncrono/aguardar.
    return NextResponse.json(data, { status: res.status });
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
