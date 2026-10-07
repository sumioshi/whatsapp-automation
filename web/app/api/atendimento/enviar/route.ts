import { NextResponse } from "next/server";
import { readGroupRecords } from "@/lib/data";
import { atendenteDoPedido, exigirChat, irmaosLiberados, respostaDeErro } from "@/lib/equipe/acesso";
import { destinoDoSlug } from "@/lib/equipe/destino";
import { motivoDeRecusa, recentesDaConta, registrosDaConversa } from "@/lib/equipe/envio";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

/** Texto do atendente: sai na hora, como o operador, carimbado com o login. */
export async function POST(req: Request) {
  try {
    const a = await atendenteDoPedido();
    const body = (await req.json().catch(() => ({}))) as { slug?: string; texto?: string };
    const slug = typeof body.slug === "string" ? body.slug : "";
    exigirChat(a, slug);
    if (typeof body.texto !== "string") return NextResponse.json({ error: "texto inválido" }, { status: 400 });
    const texto = body.texto.trim();
    if (!texto) return NextResponse.json({ error: "texto vazio" }, { status: 400 });
    const jid = await destinoDoSlug(slug);
    if (!jid) return NextResponse.json({ error: "não achei o destino deste chat" }, { status: 409 });
    const registros = await registrosDaConversa(await irmaosLiberados(a, slug), readGroupRecords);
    const recusa = motivoDeRecusa(texto, recentesDaConta(registros, Date.now()));
    if (recusa) return NextResponse.json({ error: recusa }, { status: 422 });
    const res = await fetch(`${CONTROL_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jid, text: texto, slug, ator: "painel", usuario: a.usuario.login }),
    }).catch(() => null);
    if (!res) return NextResponse.json({ error: "WhatsApp fora do ar agora — tenta de novo em instantes." }, { status: 502 });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) return NextResponse.json({ error: data.error ?? "falha no envio" }, { status: res.status || 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDeErro(e);
  }
}
