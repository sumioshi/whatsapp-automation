import { NextResponse } from "next/server";
import { corpoJson, ErroApi, preflight, respostaOk, rota } from "@/lib/api-v1";
import { gravarDespacho, passadaValida, validarItem } from "@/lib/despacho-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Corpo {
  passada?: string;
  itens?: unknown[];
}

const MAX_ITENS = 60;

/**
 * Recebe os itens de decisão de uma passada da triagem e grava a fila. O envio
 * pro operador e a execução dos comandos ficam com o coletor (Despacho).
 */
export const POST = rota("write", async ({ req }) => {
  const corpo = await corpoJson<Corpo>(req);
  const passada = corpo.passada?.trim() ?? "";
  if (!passadaValida(passada)) {
    throw new ErroApi("invalid_request", "passada deve ter o formato YYYY-MM-DDTHHmm");
  }
  if (!Array.isArray(corpo.itens)) throw new ErroApi("invalid_request", "itens deve ser lista");
  if (corpo.itens.length > MAX_ITENS) {
    throw new ErroApi("invalid_request", `no máximo ${MAX_ITENS} itens por passada`);
  }
  let itens: ReturnType<typeof validarItem>[];
  try {
    itens = corpo.itens.map(validarItem);
  } catch (e) {
    throw new ErroApi("invalid_request", e instanceof Error ? e.message : "item inválido");
  }
  const arquivo = await gravarDespacho(passada, itens);
  return respostaOk({ passada, arquivo: `despacho/${passada}.json`, itens: arquivo.itens.length });
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
