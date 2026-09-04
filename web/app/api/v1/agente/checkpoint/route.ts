import { NextResponse } from "next/server";
import { corpoJson, ErroApi, preflight, respostaOk, rota, slugValido } from "@/lib/api-v1";
import { avancarTriagemSeen } from "@/lib/triagem-seen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Corpo {
  slug?: string;
  ate?: string;
}

/** Avança o checkpoint da triagem de um chat; nunca recua. */
export const POST = rota("write", async ({ req }) => {
  const corpo = await corpoJson<Corpo>(req);
  const slug = corpo.slug?.trim() ?? "";
  if (!slugValido(slug)) throw new ErroApi("invalid_request", "slug inválido");
  if (typeof corpo.ate !== "string" || Number.isNaN(Date.parse(corpo.ate))) {
    throw new ErroApi("invalid_request", "ate deve ser um timestamp ISO");
  }
  const avancou = await avancarTriagemSeen(slug, corpo.ate);
  return respostaOk({ slug, ate: corpo.ate, avancou });
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
