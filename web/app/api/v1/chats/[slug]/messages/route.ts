import { NextResponse } from "next/server";
import {
  corpoJson,
  ErroApi,
  jidDoSlug,
  preflight,
  respostaOk,
  rota,
  slugValido,
} from "@/lib/api-v1";
import { readGroupMessages } from "@/lib/data";
import { dsSend, dsTriage } from "@/lib/data-source";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE_PADRAO = 100;
const LIMITE_MAX = 500;

function slugDaUrl(req: Request): string {
  const partes = new URL(req.url).pathname.split("/").filter(Boolean);
  // .../chats/<slug>/messages
  const slug = decodeURIComponent(partes[partes.length - 2] ?? "");
  if (!slugValido(slug)) throw new ErroApi("invalid_request", "slug inválido");
  return slug;
}

/**
 * Histórico do chat, do mais antigo para o mais recente dentro da janela.
 * Pagina para trás: `page.next` traz o id a passar em `before` para buscar o
 * bloco anterior.
 */
export const GET = rota("read", async ({ req }) => {
  const slug = slugDaUrl(req);
  const url = new URL(req.url);
  const cru = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(cru) && cru > 0 ? Math.min(cru, LIMITE_MAX) : LIMITE_PADRAO;
  const before = url.searchParams.get("before") ?? undefined;
  if (before && !/^[\w=+/-]{1,128}$/.test(before)) {
    throw new ErroApi("invalid_request", "before inválido");
  }

  const mensagens = await readGroupMessages(slug, { limit, before });
  const primeira = mensagens[0]?.id ?? null;
  return respostaOk(
    mensagens.map((m) => ({
      id: m.id,
      timestamp: m.timestamp,
      fromMe: m.fromMe,
      sender: m.sender,
      senderName: m.senderName,
      type: m.type,
      text: m.text ?? null,
      quotedText: m.quotedText ?? null,
      quotedSender: m.quotedSender ?? null,
      mediaPath: m.mediaPath ?? null,
      transcript: m.transcript ?? null,
      reactions: m.reactions ?? [],
      receipt: m.receipt ?? null,
      edited: m.edited ?? false,
      deleted: m.deleted ?? false,
    })),
    { page: { next: primeira, hasMore: mensagens.length === limit } },
  );
});

interface CorpoEnvio {
  text?: string;
  /** true entrega o texto inteiro num balão só, em vez de fatiar. */
  oneBalloon?: boolean;
  /** Entrega com ritmo humano (visto, digitando, pausas). Default true. */
  human?: boolean;
  media?: { url: string; kind: string; fileName?: string; caption?: string };
}

/**
 * Envia no chat: texto ou mídia por URL. A resposta devolve o `mode` do chat —
 * `confirm` significa que a convenção interna pede aprovação humana antes de
 * mandar; a API não bloqueia, mas informa para o integrador decidir.
 */
export const POST = rota("write", async ({ req }) => {
  const slug = slugDaUrl(req);
  const jid = await jidDoSlug(slug);
  if (!jid) throw new ErroApi("not_found", `não consegui resolver o destino de "${slug}"`);
  const corpo = await corpoJson<CorpoEnvio>(req);
  const triagem = await dsTriage();
  const mode = triagem.autonomo?.[slug] === true ? "autonomous" : "confirm";

  if (corpo.media) {
    const { url, kind, fileName, caption } = corpo.media;
    if (!url || !kind) throw new ErroApi("invalid_request", "media.url e media.kind são obrigatórios");
    const res = await fetch(`${CONTROL_URL}/send-media-url`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jid, url, kind, fileName, caption }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      throw new ErroApi("internal", data.error ?? "falha ao enviar mídia");
    }
    return respostaOk({ slug, jid, mode, sent: "media" });
  }

  const text = corpo.text?.trim();
  if (!text) throw new ErroApi("invalid_request", "text ou media é obrigatório");
  await dsSend(jid, text, {
    humano: corpo.human !== false,
    slug,
    typos: triagem.typos?.[slug] === true,
    umBalao: corpo.oneBalloon === true,
  });
  return respostaOk({ slug, jid, mode, sent: "text" });
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
