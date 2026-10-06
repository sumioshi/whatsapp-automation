import { NextResponse } from "next/server";
import { readGroupRecords } from "@/lib/data";
import { atendenteDoPedido, ErroHttp, exigirChat, irmaosLiberados, respostaDeErro } from "@/lib/equipe/acesso";
import { registrosDaConversa } from "@/lib/equipe/envio";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

/** A chave da reação sai do histórico da conversa (com o irmão de DM) — o atendente só manda o id. */
export async function POST(req: Request) {
  try {
    const a = await atendenteDoPedido(req);
    const body = (await req.json().catch(() => ({}))) as { slug?: string; msgId?: string; emoji?: string };
    const slug = typeof body.slug === "string" ? body.slug : "";
    exigirChat(a, slug);
    if (typeof body.emoji !== "string") return NextResponse.json({ error: "emoji é obrigatório" }, { status: 400 });
    if (typeof body.msgId !== "string") return NextResponse.json({ error: "msgId é obrigatório" }, { status: 400 });
    const registros = await registrosDaConversa(await irmaosLiberados(a, slug), readGroupRecords);
    const alvo = registros.find((r) => r.id === body.msgId);
    if (!alvo) throw new ErroHttp(404, "mensagem não encontrada neste chat");
    const res = await fetch(`${CONTROL_URL}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jid: alvo.groupJid, msgId: alvo.id, participant: alvo.sender, fromMe: Boolean(alvo.fromMe), emoji: body.emoji }),
    }).catch(() => null);
    if (!res) return NextResponse.json({ error: "WhatsApp fora do ar agora." }, { status: 502 });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) return NextResponse.json({ error: data.error ?? "falha ao reagir" }, { status: res.status || 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDeErro(e);
  }
}
