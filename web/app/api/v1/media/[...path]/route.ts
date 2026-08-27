import { preflight, respostaErro, rota } from "@/lib/api-v1";
import { NextResponse } from "next/server";
import { GET as midiaDoPainel } from "@/app/api/media/[...path]/route";

export const runtime = "nodejs";

/**
 * Serve o arquivo de mídia referenciado por `mediaPath` das mensagens.
 * Autentica por Bearer e delega ao handler do painel, que já cuida de
 * content-type, range e proteção contra travessia de caminho.
 */
export const GET = rota("read", async ({ req }) => {
  const partes = new URL(req.url).pathname.split("/").filter(Boolean);
  const caminho = partes.slice(3).map(decodeURIComponent); // remove api/v1/media
  if (!caminho.length) return respostaErro("invalid_request", "caminho vazio");
  const res = await midiaDoPainel(req, { params: Promise.resolve({ path: caminho }) });
  return res as NextResponse;
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
