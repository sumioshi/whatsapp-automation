import { ErroApi, preflight, respostaErro, rota, slugValido } from "@/lib/api-v1";
import { NextResponse } from "next/server";
import { GET as eventosDoPainel } from "@/app/api/events/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stream SSE das mensagens novas do chat, a partir do momento da conexão.
 * Autentica por Bearer e delega ao handler do painel — ele já resolve
 * heartbeat, fs.watch e o poll de segurança; duplicar isso aqui só criaria
 * uma segunda implementação para manter.
 */
export const GET = rota("read", async ({ req }) => {
  const partes = new URL(req.url).pathname.split("/").filter(Boolean);
  const slug = decodeURIComponent(partes[partes.length - 2] ?? "");
  if (!slugValido(slug)) throw new ErroApi("invalid_request", "slug inválido");

  const interna = new URL(req.url);
  interna.pathname = "/api/events";
  interna.search = `?slug=${encodeURIComponent(slug)}`;
  const res = await eventosDoPainel(new Request(interna, { headers: req.headers }));
  if (!(res instanceof Response)) return respostaErro("internal", "stream indisponível");
  return res as NextResponse;
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
