import { NextResponse } from "next/server";
import { corpoJson, ErroApi, preflight, respostaOk, rota } from "@/lib/api-v1";
import { type EntradaFeature, listarFeatures, registrarFeature } from "@/lib/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Entregas registradas, filtráveis por chat e por instante inicial. */
export const GET = rota("read", async ({ req }) => {
  const u = new URL(req.url);
  return respostaOk(
    await listarFeatures({ slug: u.searchParams.get("slug") ?? undefined, desde: u.searchParams.get("desde") ?? undefined }),
  );
});

/** Registra uma entrega. Idempotente por `ref`: repetir a mesma URL devolve `duplicada: true`. */
export const POST = rota("write", async ({ req }) => {
  const corpo = await corpoJson<EntradaFeature>(req);
  if (corpo.origem !== undefined && corpo.origem !== "mcp" && corpo.origem !== "pr") {
    throw new ErroApi("invalid_request", 'origem deve ser "mcp" ou "pr"');
  }
  try {
    return respostaOk(await registrarFeature(corpo));
  } catch (e) {
    throw new ErroApi("invalid_request", e instanceof Error ? e.message : "entrega inválida");
  }
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
