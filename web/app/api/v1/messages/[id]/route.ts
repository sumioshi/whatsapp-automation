import { NextResponse } from "next/server";
import { corpoJson, ErroApi, jidDoSlug, preflight, respostaOk, rota, slugValido } from "@/lib/api-v1";
import { dsEditMessage } from "@/lib/data-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function idDaUrl(req: Request): string {
  const partes = new URL(req.url).pathname.split("/").filter(Boolean);
  const id = decodeURIComponent(partes[partes.length - 1] ?? "");
  if (!/^[\w=+/-]{1,128}$/.test(id)) throw new ErroApi("invalid_request", "id inválido");
  return id;
}

/**
 * Edita uma mensagem própria. Precisa do `chat` no corpo: o id de mensagem do
 * WhatsApp só é único dentro da conversa, não globalmente.
 */
export const PATCH = rota("write", async ({ req }) => {
  const id = idDaUrl(req);
  const { chat, text } = await corpoJson<{ chat?: string; text?: string }>(req);
  if (!chat || !slugValido(chat)) throw new ErroApi("invalid_request", "chat (slug) é obrigatório");
  const texto = text?.trim();
  if (!texto) throw new ErroApi("invalid_request", "text é obrigatório");
  const jid = await jidDoSlug(chat);
  if (!jid) throw new ErroApi("not_found", `chat "${chat}" não encontrado`);
  await dsEditMessage(jid, id, texto);
  return respostaOk({ id, chat, text: texto });
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
