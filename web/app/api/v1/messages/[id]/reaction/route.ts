import { NextResponse } from "next/server";
import { corpoJson, ErroApi, jidDoSlug, preflight, respostaOk, rota, slugValido } from "@/lib/api-v1";
import { dsReact } from "@/lib/data-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function idDaUrl(req: Request): string {
  const partes = new URL(req.url).pathname.split("/").filter(Boolean);
  // .../messages/<id>/reaction
  const id = decodeURIComponent(partes[partes.length - 2] ?? "");
  if (!/^[\w=+/-]{1,128}$/.test(id)) throw new ErroApi("invalid_request", "id inválido");
  return id;
}

interface CorpoReacao {
  chat?: string;
  emoji?: string;
  /** Autor da mensagem reagida — necessário em grupo. */
  participant?: string;
  fromMe?: boolean;
}

/** PUT porque reagir é idempotente: define a reação, não acumula. Emoji vazio remove. */
export const PUT = rota("write", async ({ req }) => {
  const id = idDaUrl(req);
  const corpo = await corpoJson<CorpoReacao>(req);
  if (!corpo.chat || !slugValido(corpo.chat)) {
    throw new ErroApi("invalid_request", "chat (slug) é obrigatório");
  }
  const jid = await jidDoSlug(corpo.chat);
  if (!jid) throw new ErroApi("not_found", `chat "${corpo.chat}" não encontrado`);
  await dsReact(jid, id, corpo.emoji ?? "", corpo.participant, corpo.fromMe);
  return respostaOk({ id, chat: corpo.chat, emoji: corpo.emoji ?? "" });
});

export const DELETE = rota("write", async ({ req }) => {
  const id = idDaUrl(req);
  const corpo = await corpoJson<CorpoReacao>(req).catch(() => ({}) as CorpoReacao);
  if (!corpo.chat || !slugValido(corpo.chat)) {
    throw new ErroApi("invalid_request", "chat (slug) é obrigatório");
  }
  const jid = await jidDoSlug(corpo.chat);
  if (!jid) throw new ErroApi("not_found", `chat "${corpo.chat}" não encontrado`);
  await dsReact(jid, id, "", corpo.participant, corpo.fromMe);
  return respostaOk({ id, chat: corpo.chat, emoji: "" });
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
